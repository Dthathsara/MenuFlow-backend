import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Billing, Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingQueryDto } from './dto/billing-query.dto';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { RefundBillDto } from './dto/refund-bill.dto';

type BillingCurrentUser = {
  id?: string;
  tenantId?: string | null;
};

type BillStatus = 'Pending' | 'Paid' | 'Refunded';

const PAYMENT_METHODS = ['Cash', 'Card', 'Online', 'Pending'] as const;
const PAYMENT_METHOD_DETAILS: Record<
  string,
  { label: string; description: string; accentClassName: string }
> = {
  Cash: {
    label: 'Cash',
    description: 'Counter settlement',
    accentClassName: 'from-blue-500 to-sky-400',
  },
  Card: {
    label: 'Card',
    description: 'Card payment',
    accentClassName: 'from-violet-500 to-purple-400',
  },
  Online: {
    label: 'Online',
    description: 'Online transfer',
    accentClassName: 'from-emerald-500 to-teal-400',
  },
  Pending: {
    label: 'Pending',
    description: 'Awaiting payment',
    accentClassName: 'from-amber-500 to-orange-400',
  },
  Other: {
    label: 'Other',
    description: 'Other payment method',
    accentClassName: 'from-slate-500 to-gray-400',
  },
};

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: BillingCurrentUser, query: BillingQueryDto = {}) {
    const tenantId = this.requireTenantId(currentUser);
    const where = this.buildWhere(tenantId, query);
    const today = this.todayRange();

    const [bills, todayBills, pendingBills] = await Promise.all([
      this.prisma.billing.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.billing.findMany({
        where: {
          tenantId,
          deletedAt: null,
          issuedAt: { gte: today.from, lt: today.to },
        },
      }),
      this.prisma.billing.findMany({
        where: { tenantId, deletedAt: null, status: 'Pending' },
        orderBy: { issuedAt: 'asc' },
      }),
    ]);

    return this.buildBillingReport(bills, todayBills, pendingBills);
  }

  async create(dto: CreateBillDto, currentUser: BillingCurrentUser) {
    const tenantId = this.requireTenantId(currentUser);
    const status = this.normalizeStatus(dto.status ?? 'Pending');
    const order = dto.orderId
      ? await this.prisma.order.findFirst({
          where: { id: dto.orderId, tenantId, deletedAt: null },
          include: { items: { where: { deletedAt: null } } },
        })
      : null;

    if (dto.orderId && !order) {
      throw new BadRequestException('Linked order was not found.');
    }

    const waiterName = this.requiredTrim(dto.waiterName, 'waiterName');
    const tableNumber =
      this.optionalTrim(dto.tableNumber) ?? (order ? order.tableId ?? 'Unknown' : null);
    if (!tableNumber) {
      throw new BadRequestException('tableNumber is required.');
    }

    const subtotal = order ? Number(order.subtotal) : this.safeAmount(dto.subtotal);
    const taxAmount = order ? Number(order.taxAmount) : this.safeAmount(dto.taxAmount);
    const serviceChargeAmount = order
      ? Number(order.serviceChargeAmount)
      : this.safeAmount(dto.serviceChargeAmount);
    const totalAmount = order
      ? Number(order.totalAmount)
      : this.safeAmount(
          dto.totalAmount ?? subtotal + taxAmount + serviceChargeAmount,
        );
    if (totalAmount <= 0) {
      throw new BadRequestException('totalAmount must be greater than 0.');
    }

    const data = {
      tenantId,
      billNumber: '',
      orderId: order?.id ?? this.optionalTrim(dto.orderId) ?? null,
      tableNumber,
      waiterName,
      itemsCount:
        order?.items.reduce((total, item) => total + item.quantity, 0) ??
        Math.max(0, Math.round(dto.itemsCount ?? 0)),
      subtotal: new Prisma.Decimal(subtotal),
      taxAmount: new Prisma.Decimal(taxAmount),
      serviceChargeAmount: new Prisma.Decimal(serviceChargeAmount),
      totalAmount: new Prisma.Decimal(totalAmount),
      method: this.normalizeMethod(
        dto.method ?? (status === 'Paid' ? 'Cash' : 'Pending'),
      ),
      status,
      paidAt: status === 'Paid' ? new Date() : null,
      createdById: currentUser.id ?? null,
    };

    const bill = await this.createWithNextBillNumber(data);

    if (bill.orderId && bill.status === 'Paid') {
      await this.updateLinkedOrderPaymentStatus(tenantId, bill.orderId, 'paid');
    }

    return this.toResponse(bill, order?.items);
  }

  async collectPayment(
    id: string,
    dto: CollectPaymentDto,
    currentUser: BillingCurrentUser,
  ) {
    const tenantId = this.requireTenantId(currentUser);
    const existing = await this.findTenantBill(id, tenantId);
    const bill = await this.prisma.billing.update({
      where: { id: existing.id },
      data: {
        status: 'Paid',
        method: this.normalizeMethod(dto.method ?? 'Cash'),
        paidAt: new Date(),
      },
    });

    if (bill.orderId) {
      await this.updateLinkedOrderPaymentStatus(tenantId, bill.orderId, 'paid');
    }

    return this.toResponse(bill);
  }

  async refund(id: string, dto: RefundBillDto, currentUser: BillingCurrentUser) {
    const tenantId = this.requireTenantId(currentUser);
    const existing = await this.findTenantBill(id, tenantId);
    const refundReason = dto.refundReason ?? dto.reason;
    const bill = await this.prisma.billing.update({
      where: { id: existing.id },
      data: {
        status: 'Refunded',
        refundedAt: new Date(),
        refundReason: this.optionalTrim(refundReason),
      },
    });

    if (bill.orderId) {
      await this.updateLinkedOrderPaymentStatus(
        tenantId,
        bill.orderId,
        'refunded',
      );
    }

    return this.toResponse(bill);
  }

  async export(currentUser: BillingCurrentUser, query: BillingQueryDto = {}) {
    const data = await this.findAll(currentUser, query);
    return {
      generatedAt: new Date().toISOString(),
      ...data,
      data,
    };
  }

  private buildWhere(tenantId: string, query: BillingQueryDto) {
    const where: Prisma.BillingWhereInput = { tenantId, deletedAt: null };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { billNumber: { contains: search, mode: 'insensitive' } },
        { tableNumber: { contains: search, mode: 'insensitive' } },
        { waiterName: { contains: search, mode: 'insensitive' } },
        { orderId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const status = query.status?.trim();
    if (status && status.toLowerCase() !== 'all') {
      where.status = this.normalizeStatus(status);
    }

    const method = query.method?.trim();
    if (method && method.toLowerCase() !== 'all') {
      where.method = this.normalizeMethod(method);
    }

    return where;
  }

  private buildBillingReport(
    bills: Billing[],
    todayBills: Billing[],
    pendingBills: Billing[],
  ) {
    const paidToday = todayBills.filter((bill) => bill.status === 'Paid');
    const todayRevenue = this.sumBills(paidToday, 'totalAmount');
    const billsGenerated = todayBills.length;
    const avgBillValue = billsGenerated
      ? this.sumBills(todayBills, 'totalAmount') / billsGenerated
      : 0;
    const collectedToday = todayRevenue;
    const pendingCollection = this.sumBills(pendingBills, 'totalAmount');
    const taxAndService =
      this.sumBills(todayBills, 'taxAmount') +
      this.sumBills(todayBills, 'serviceChargeAmount');

    return {
      stats: {
        todayRevenue,
        pendingTables: pendingBills.length,
        billsGenerated,
        waiterServed: todayBills.reduce(
          (total, bill) => total + bill.itemsCount,
          0,
        ),
        avgBillValue,
      },
      bills: bills.map((bill) => this.toResponse(bill)),
      cashierSummary:
        todayBills.length || pendingBills.length
          ? [
              {
                label: 'Collected Today',
                value: collectedToday,
              },
              {
                label: 'Pending Collection',
                value: pendingCollection,
              },
              {
                label: 'Tax and Service',
                value: taxAndService,
              },
            ]
          : [],
      pendingCollectionQueue: pendingBills.map((bill) => ({
        id: bill.id,
        billNumber: bill.billNumber,
        tableNumber: bill.tableNumber,
        waiterName: bill.waiterName,
        totalAmount: Number(bill.totalAmount),
      })),
      paymentMethods: this.buildPaymentMethods(bills),
    };
  }

  private buildPaymentMethods(bills: Billing[]) {
    if (!bills.length) {
      return [];
    }

    const rows = new Map<string, { amount: number; count: number }>();
    for (const bill of bills) {
      const method = this.summaryMethod(bill.method);
      const row = rows.get(method) ?? { amount: 0, count: 0 };
      row.amount += Number(bill.totalAmount ?? 0);
      row.count += 1;
      rows.set(method, row);
    }

    const totalAmount = Array.from(rows.values()).reduce(
      (total, row) => total + row.amount,
      0,
    );
    return Array.from(rows.entries())
      .filter(([, row]) => row.count > 0)
      .map(([method, row]) => {
        const details =
          PAYMENT_METHOD_DETAILS[method] ?? PAYMENT_METHOD_DETAILS.Other;
        const percent = totalAmount
          ? Math.round((row.amount / totalAmount) * 100)
          : 0;
        return {
          method,
          label: details.label,
          description: details.description,
          amount: row.amount,
          count: row.count,
          percent,
          percentage: percent,
          accentClassName: details.accentClassName,
        };
      });
  }

  private async createWithNextBillNumber(
    data: Omit<Prisma.BillingUncheckedCreateInput, 'billNumber'> & {
      billNumber: string;
    },
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const billNumber = await this.nextBillNumber(data.tenantId);
      try {
        return await this.prisma.billing.create({
          data: { ...data, billNumber },
        });
      } catch (error: unknown) {
        if (!this.isUniqueCollision(error)) {
          throw error;
        }
      }
    }

    throw new BadRequestException('Could not generate a unique bill number.');
  }

  private async nextBillNumber(tenantId: string) {
    const latest = await this.prisma.billing.findFirst({
      where: { tenantId },
      select: { billNumber: true },
      orderBy: { createdAt: 'desc' },
    });
    const lastNumber = Number(latest?.billNumber?.match(/\d+$/)?.[0] ?? 2041);
    return `#BILL-${lastNumber + 1}`;
  }

  private async findTenantBill(id: string, tenantId: string) {
    const bill = await this.prisma.billing.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!bill) {
      throw new NotFoundException('Bill not found.');
    }
    return bill;
  }

  private async updateLinkedOrderPaymentStatus(
    tenantId: string,
    orderId: string,
    paymentStatus: string,
  ) {
    await this.prisma.order.updateMany({
      where: { id: orderId, tenantId, deletedAt: null },
      data: { paymentStatus },
    });
  }

  private requireTenantId(currentUser: BillingCurrentUser) {
    const tenantId = currentUser?.tenantId?.trim();
    if (!currentUser?.id || !tenantId) {
      throw new UnauthorizedException(
        'Manager account is not connected to a restaurant.',
      );
    }
    return tenantId;
  }

  private normalizeStatus(status: string): BillStatus {
    const normalized = status.trim().toLowerCase();
    if (normalized === 'paid') {
      return 'Paid';
    }
    if (normalized === 'refunded') {
      return 'Refunded';
    }
    if (normalized === 'pending') {
      return 'Pending';
    }
    throw new BadRequestException('Invalid billing status.');
  }

  private normalizeMethod(method: string) {
    const normalized = method.trim().toLowerCase();
    if (normalized === 'cash') {
      return 'Cash';
    }
    if (normalized === 'card') {
      return 'Card';
    }
    if (normalized === 'online') {
      return 'Online';
    }
    if (normalized === 'pending') {
      return 'Pending';
    }
    return method.trim() || 'Pending';
  }

  private summaryMethod(method: string | null | undefined) {
    const normalized = method?.trim().toLowerCase();
    if (normalized === 'cash') {
      return 'Cash';
    }
    if (normalized === 'card') {
      return 'Card';
    }
    if (normalized === 'online') {
      return 'Online';
    }
    if (normalized === 'pending') {
      return 'Pending';
    }
    return 'Other';
  }

  private todayRange() {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }

  private requiredTrim(value: string | undefined, fieldName: string) {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException(`${fieldName} is required.`);
    }
    return trimmed;
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private safeAmount(value?: number) {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(0, value);
  }

  private sumBills<T extends 'totalAmount' | 'taxAmount' | 'serviceChargeAmount'>(
    bills: Array<Record<T, Prisma.Decimal>>,
    field: T,
  ) {
    return bills.reduce((total, bill) => total + Number(bill[field] ?? 0), 0);
  }

  private isUniqueCollision(error: unknown) {
    return (error as { code?: string })?.code === 'P2002';
  }

  private toResponse(
    bill: Billing,
    orderItems: Array<{
      id: string;
      foodName: string;
      categoryName: string | null;
      subCategoryName: string | null;
      servingSize: string | null;
      unitPrice: Prisma.Decimal;
      quantity: number;
      lineTotal: Prisma.Decimal;
      imageUrl: string | null;
      itemNote: string | null;
    }> = [],
  ) {
    const totalAmount = Number(bill.totalAmount);
    let taxAmount = Number(bill.taxAmount);
    let serviceChargeAmount = Number(bill.serviceChargeAmount);
    let subtotal = Number(bill.subtotal);
    if (subtotal <= 0 && totalAmount > 0) {
      taxAmount = Math.max(0, taxAmount);
      serviceChargeAmount = Math.max(0, serviceChargeAmount);
      subtotal = Math.max(0, totalAmount - taxAmount - serviceChargeAmount);
    }

    return {
      id: bill.id,
      tenantId: bill.tenantId,
      billNumber: bill.billNumber,
      orderId: bill.orderId,
      tableNumber: bill.tableNumber,
      waiterName: bill.waiterName,
      itemsCount: bill.itemsCount,
      subtotal,
      taxAmount,
      serviceChargeAmount,
      totalAmount,
      method: bill.method,
      status: bill.status,
      issuedAt: bill.issuedAt.toISOString(),
      paidAt: bill.paidAt?.toISOString() ?? null,
      refundedAt: bill.refundedAt?.toISOString() ?? null,
      refundReason: bill.refundReason,
      createdAt: bill.createdAt.toISOString(),
      updatedAt: bill.updatedAt.toISOString(),
      receipt: {
        items: orderItems.map((item) => ({
          id: item.id,
          foodName: item.foodName,
          name: item.foodName,
          categoryName: item.categoryName,
          subCategoryName: item.subCategoryName,
          servingSize: item.servingSize,
          unitPrice: Number(item.unitPrice),
          quantity: item.quantity,
          lineTotal: Number(item.lineTotal),
          imageUrl: item.imageUrl,
          itemNote: item.itemNote,
        })),
      },
    };
  }
}
