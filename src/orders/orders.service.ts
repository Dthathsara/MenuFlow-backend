import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const ORDER_STATUSES = ['accepted', 'preparing', 'ready', 'delivered', 'cancelled'] as const;
const ACTIVE_ORDER_STATUSES = ['accepted', 'preparing', 'ready'];

type ManagerOrdersQuery = {
  search?: string;
  paymentStatus?: string;
  orderStatus?: string;
};

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async createCustomerOrder(dto: CreateOrderDto) {
    console.log('CREATE CUSTOMER ORDER', {
      tenantId: dto.tenant_id,
      customerSessionId: dto.customer_session_id,
      itemCount: dto.items?.length,
    });

    const tenantId = dto.tenant_id?.trim();
    const customerSessionId = dto.customer_session_id.trim();
    const customerName = dto.customer_name.trim();
    const customerPhone = dto.customer_phone.trim();
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!customerSessionId) {
      throw new BadRequestException('customer_session_id is required.');
    }
    if (!customerName) {
      throw new BadRequestException('customer_name is required.');
    }
    if (!customerPhone) {
      throw new BadRequestException('customer_phone is required.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new BadRequestException('Invalid tenant_id');
    }

    const settings = await this.prisma.user.findFirst({
      where: { tenantId, deletedAt: null },
      select: { taxRate: true, serviceChargeRate: true, discountRate: true },
      orderBy: { createdAt: 'asc' },
    });

    const subtotal = dto.items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.unit_price).mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    const taxRate = settings?.taxRate ?? new Prisma.Decimal(5);
    const serviceChargeRate = settings?.serviceChargeRate ?? new Prisma.Decimal(3);
    const discountRate = settings?.discountRate ?? new Prisma.Decimal(0);
    const taxAmount = subtotal.mul(taxRate).div(100);
    const serviceChargeAmount = subtotal.mul(serviceChargeRate).div(100);
    const discountAmount = discountRate.gt(0) ? subtotal.mul(discountRate).div(100) : new Prisma.Decimal(0);
    const totalAmount = subtotal.plus(taxAmount).plus(serviceChargeAmount).minus(discountAmount);
    const paymentStatus = dto.payment?.status === 'paid' ? 'paid' : 'unpaid';
    const now = new Date();

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        orderNumber: this.generateOrderNumber(),
        customerSessionId,
        tableId: dto.table_id?.trim() || null,
        qrCodeId: dto.qr_code_id?.trim() || null,
        customerName,
        customerPhone,
        orderType: dto.order_type,
        orderStatus: 'accepted',
        paymentStatus,
        subtotal,
        taxRate,
        taxAmount,
        serviceChargeRate,
        serviceChargeAmount,
        discountRate,
        discountAmount,
        totalAmount,
        itemNote: dto.item_note?.trim() || null,
        acceptedAt: now,
        items: {
          create: dto.items.map((item) => {
            const unitPrice = new Prisma.Decimal(item.unit_price);
            return {
              menuItemId: item.menu_item_id?.trim() || null,
              foodName: item.food_name.trim(),
              categoryName: item.category_name?.trim() || null,
              subCategoryName: item.sub_category_name?.trim() || null,
              servingSize: item.serving_size?.trim() || null,
              unitPrice,
              quantity: item.quantity,
              lineTotal: unitPrice.mul(item.quantity),
              prepTimeMin: item.prep_time_min ?? null,
              imageUrl: item.image_url?.trim() || null,
              itemNote: item.item_note?.trim() || null,
            };
          }),
        },
      },
      include: { items: true },
    });

    return this.mapOrder(order);
  }

  async findCustomerOrder(id: string, tenantId?: string) {
    const trimmedTenantId = tenantId?.trim();
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        ...(trimmedTenantId ? { tenantId: trimmedTenantId } : {}),
        deletedAt: null,
      },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return this.mapOrder(order);
  }

  async findCustomerSessionOrders(customerSessionId: string, tenantId?: string) {
    console.log('LOAD CUSTOMER SESSION ORDERS', {
      customerSessionId,
      tenantId,
    });

    const trimmedCustomerSessionId = customerSessionId.trim();
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedCustomerSessionId) {
      throw new BadRequestException('customerSessionId is required.');
    }
    if (!trimmedTenantId) {
      return { orders: [] };
    }

    const orders = await this.prisma.order.findMany({
      where: {
        customerSessionId: trimmedCustomerSessionId,
        tenantId: trimmedTenantId,
        deletedAt: null,
      },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      orderBy: { placedAt: 'desc' },
    });
    return { orders: orders.map((order) => this.mapOrder(order)) };
  }

  async findManagerOrders(currentUser: any, query: ManagerOrdersQuery = {}) {
    const tenantId = this.requireTenantId(currentUser);
    const where = this.buildManagerOrdersWhere(tenantId, query);

    const orders = await this.prisma.order.findMany({
      where,
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      orderBy: { placedAt: 'desc' },
    });

    return {
      summary: await this.getManagerOrdersSummary(tenantId),
      orders: orders.map((order) => this.mapOrder(order)),
    };
  }

  async findManagerOrder(id: string, currentUser: any) {
    const tenantId = this.requireTenantId(currentUser);
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.mapOrder(order);
  }

  async updateManagerOrderStatus(id: string, dto: UpdateOrderStatusDto, currentUser: any) {
    const tenantId = this.requireTenantId(currentUser);
    const orderStatus = dto.order_status ?? dto.orderStatus;
    if (!ORDER_STATUSES.includes(orderStatus as any)) {
      throw new BadRequestException('Invalid order_status.');
    }

    const existing = await this.prisma.order.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    const timestampField = this.statusTimestampField(orderStatus);
    await this.prisma.order.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        orderStatus,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
      },
    });

    const order = await this.prisma.order.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });

    return this.mapOrder(order);
  }

  private requireTenantId(currentUser: any) {
    const tenantId = currentUser?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Manager account is not connected to a restaurant.');
    }
    return tenantId;
  }

  private buildManagerOrdersWhere(tenantId: string, query: ManagerOrdersQuery) {
    const where: Prisma.OrderWhereInput = {
      tenantId,
      deletedAt: null,
    };

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { orderType: { contains: search, mode: 'insensitive' } },
      ];
    }

    const paymentStatus = query.paymentStatus?.trim();
    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    const orderStatus = query.orderStatus?.trim();
    if (orderStatus) {
      where.orderStatus = orderStatus;
    }

    return where;
  }

  private async getManagerOrdersSummary(tenantId: string) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const baseWhere = { tenantId, deletedAt: null };
    const pendingPaymentWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      paymentStatus: { not: 'paid' },
    };

    const [
      totalOrders,
      pendingPayments,
      pendingPaymentAmount,
      activeOrders,
      deliveredToday,
    ] = await Promise.all([
      this.prisma.order.count({ where: baseWhere }),
      this.prisma.order.count({ where: pendingPaymentWhere }),
      this.prisma.order.aggregate({
        where: pendingPaymentWhere,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({
        where: {
          ...baseWhere,
          orderStatus: { in: ACTIVE_ORDER_STATUSES },
        },
      }),
      this.prisma.order.count({
        where: {
          ...baseWhere,
          OR: [
            {
              deliveredAt: {
                gte: startOfToday,
                lt: startOfTomorrow,
              },
            },
            {
              orderStatus: 'delivered',
              updatedAt: {
                gte: startOfToday,
                lt: startOfTomorrow,
              },
            },
          ],
        },
      }),
    ]);

    return {
      totalOrders,
      pendingPayments,
      pendingPaymentAmount: Number(pendingPaymentAmount._sum.totalAmount ?? 0),
      activeOrders,
      deliveredToday,
    };
  }

  private statusTimestampField(status: string) {
    const fields: Record<string, string> = {
      accepted: 'acceptedAt',
      preparing: 'preparingAt',
      ready: 'readyAt',
      delivered: 'deliveredAt',
      cancelled: 'cancelledAt',
    };
    return fields[status];
  }

  private generateOrderNumber() {
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `ORD-${date}-${time}-${nanoid(4).toUpperCase()}`;
  }

  private mapOrder(order: any) {
    return {
      id: order.id,
      tenant_id: order.tenantId,
      order_number: order.orderNumber,
      customer_session_id: order.customerSessionId,
      table_id: order.tableId,
      qr_code_id: order.qrCodeId,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      order_type: order.orderType,
      order_status: order.orderStatus,
      payment_status: order.paymentStatus,
      subtotal: Number(order.subtotal),
      tax_rate: Number(order.taxRate),
      tax_amount: Number(order.taxAmount),
      service_charge_rate: Number(order.serviceChargeRate),
      service_charge_amount: Number(order.serviceChargeAmount),
      discount_rate: Number(order.discountRate ?? 0),
      discount_amount: Number(order.discountAmount),
      total_amount: Number(order.totalAmount),
      item_note: order.itemNote,
      placed_at: order.placedAt,
      accepted_at: order.acceptedAt,
      preparing_at: order.preparingAt,
      ready_at: order.readyAt,
      delivered_at: order.deliveredAt,
      cancelled_at: order.cancelledAt,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      deleted_at: order.deletedAt,
      items: (order.items ?? []).map((item: any) => ({
        id: item.id,
        order_id: item.orderId,
        menu_item_id: item.menuItemId,
        food_name: item.foodName,
        category_name: item.categoryName,
        sub_category_name: item.subCategoryName,
        serving_size: item.servingSize,
        unit_price: Number(item.unitPrice),
        quantity: item.quantity,
        line_total: Number(item.lineTotal),
        prep_time_min: item.prepTimeMin,
        image_url: item.imageUrl,
        item_note: item.itemNote,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        deleted_at: item.deletedAt,
      })),
    };
  }
}
