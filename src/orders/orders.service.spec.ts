jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { OrdersService } from './orders.service';

const baseOrder = {
  id: 'order-1',
  tenantId: 'tenant-1',
  orderNumber: 'ORD-1',
  customerSessionId: 'session-1',
  tableId: null,
  qrCodeId: null,
  customerName: 'Customer',
  customerPhone: '0770000000',
  orderType: 'dine_in',
  orderStatus: 'accepted',
  paymentStatus: 'unpaid',
  subtotal: 100,
  taxRate: 5,
  taxAmount: 5,
  serviceChargeRate: 3,
  serviceChargeAmount: 3,
  discountRate: 0,
  discountAmount: 0,
  totalAmount: 108,
  itemNote: null,
  placedAt: new Date('2026-06-18T10:00:00.000Z'),
  acceptedAt: new Date('2026-06-18T10:00:00.000Z'),
  preparingAt: null,
  readyAt: null,
  deliveredAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-06-18T10:00:00.000Z'),
  updatedAt: new Date('2026-06-18T10:00:00.000Z'),
  deletedAt: null,
  items: [],
};

describe('OrdersService status history', () => {
  it('creates the initial accepted history record with a new order', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      order: {
        create: jest.fn().mockResolvedValue({
          ...baseOrder,
          statusHistory: [
            {
              status: 'accepted',
              changedAt: baseOrder.acceptedAt,
            },
          ],
        }),
      },
    };
    const service = new OrdersService(prisma as any);

    await service.createCustomerOrder({
      tenant_id: 'tenant-1',
      customer_session_id: 'session-1',
      customer_name: 'Customer',
      customer_phone: '0770000000',
      order_type: 'dine_in',
      items: [{ food_name: 'Rice', unit_price: 100, quantity: 1 }],
    });

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderStatus: 'accepted',
          statusHistory: {
            create: expect.objectContaining({ status: 'accepted' }),
          },
        }),
      }),
    );
  });

  it('adds history only when the order status changes', async () => {
    const updatedOrder = {
      ...baseOrder,
      orderStatus: 'preparing',
      preparingAt: new Date('2026-06-18T10:05:00.000Z'),
      updatedAt: new Date('2026-06-18T10:05:00.000Z'),
      statusHistory: [
        { status: 'accepted', changedAt: baseOrder.acceptedAt },
        {
          status: 'preparing',
          changedAt: new Date('2026-06-18T10:05:00.000Z'),
        },
      ],
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          tenantId: 'tenant-1',
          deletedAt: null,
          orderStatus: 'accepted',
          acceptedAt: baseOrder.acceptedAt,
          preparingAt: null,
          readyAt: null,
          deliveredAt: null,
          cancelledAt: null,
        }),
        findFirst: jest.fn().mockResolvedValue(updatedOrder),
        update: jest.fn().mockReturnValue(Promise.resolve(updatedOrder)),
      },
      orderStatusHistory: {
        create: jest
          .fn()
          .mockReturnValue(Promise.resolve(updatedOrder.statusHistory[1])),
      },
      $transaction: jest
        .fn()
        .mockImplementation((operations) => Promise.all(operations)),
    };
    const service = new OrdersService(prisma as any);

    const result = await service.updateManagerOrderStatus(
      'order-1',
      { order_status: 'preparing' },
      { tenantId: 'tenant-1' },
    );

    expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        status: 'preparing',
      }),
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        orderStatus: 'preparing',
        preparingAt: expect.any(Date),
      },
    });
    expect(result.orderStatus).toBe('preparing');
    expect(result.acceptedAt).toBe(baseOrder.acceptedAt);
    expect(result.preparingAt).toBe(updatedOrder.preparingAt);
    expect(result.statusHistory).toHaveLength(2);
  });

  it('rejects a skipped status transition', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          tenantId: 'tenant-1',
          deletedAt: null,
          orderStatus: 'preparing',
          acceptedAt: baseOrder.acceptedAt,
          preparingAt: new Date('2026-06-18T10:05:00.000Z'),
          readyAt: null,
          deliveredAt: null,
          cancelledAt: null,
        }),
        update: jest.fn(),
      },
      orderStatusHistory: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new OrdersService(prisma as any);

    await expect(
      service.updateManagerOrderStatus(
        'order-1',
        { order_status: 'delivered' },
        { tenantId: 'tenant-1' },
      ),
    ).rejects.toThrow('Invalid status transition from preparing to delivered');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a same-status update', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          tenantId: 'tenant-1',
          deletedAt: null,
          orderStatus: 'accepted',
          acceptedAt: baseOrder.acceptedAt,
          preparingAt: null,
          readyAt: null,
          deliveredAt: null,
          cancelledAt: null,
        }),
        update: jest.fn(),
      },
      orderStatusHistory: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new OrdersService(prisma as any);

    await expect(
      service.updateManagerOrderStatus(
        'order-1',
        { order_status: 'accepted' },
        { tenantId: 'tenant-1' },
      ),
    ).rejects.toThrow('Invalid status transition from accepted to accepted');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it.each(['delivered', 'cancelled'])(
    'rejects transitions from final status %s',
    async (finalStatus) => {
      const prisma = {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            tenantId: 'tenant-1',
            deletedAt: null,
            orderStatus: finalStatus,
            acceptedAt: baseOrder.acceptedAt,
            preparingAt: null,
            readyAt: null,
            deliveredAt: finalStatus === 'delivered' ? new Date() : null,
            cancelledAt: finalStatus === 'cancelled' ? new Date() : null,
          }),
          update: jest.fn(),
        },
        orderStatusHistory: { create: jest.fn() },
        $transaction: jest.fn(),
      };
      const service = new OrdersService(prisma as any);

      await expect(
        service.updateManagerOrderStatus(
          'order-1',
          { order_status: 'cancelled' },
          { tenantId: 'tenant-1' },
        ),
      ).rejects.toThrow(
        `Invalid status transition from ${finalStatus} to cancelled`,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('returns current status and updatedAt for a legacy order without history', async () => {
    const prisma = {
      order: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ ...baseOrder, statusHistory: [] }),
      },
    };
    const service = new OrdersService(prisma as any);

    const result = await service.findManagerOrder('order-1', {
      tenantId: 'tenant-1',
    });

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          statusHistory: { orderBy: { changedAt: 'asc' } },
        }),
      }),
    );
    expect(result.statusHistory).toEqual([
      {
        status: 'accepted',
        changedAt: baseOrder.updatedAt,
      },
    ]);
  });
});
