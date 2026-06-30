import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { STAFF_MEMBER_ROLES } from '../staff/dto/create-staff-member.dto';
import { OrderReportQueryDto } from './dto/order-report-query.dto';
import { UserReportQueryDto } from './dto/user-report-query.dto';

export type ReportsCurrentUser = {
  id?: string;
  tenantId?: string | null;
};

type UserReportRow = {
  id: string;
  staffMemberId: string | null;
  staffName: string;
  role: string;
  ordersServed: number;
  revenueHandled: Prisma.Decimal;
  tablesServed: number;
  shiftsWorked: number;
  periodKey: string;
  periodLabel: string;
};

type ReportPeriod = {
  key: string;
  label: string;
  from: Date;
  to: Date;
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async findUserReports(
    currentUser: ReportsCurrentUser,
    query: UserReportQueryDto = {},
  ) {
    const tenantId = this.requireTenantId(currentUser);
    const where = this.buildUserReportWhere(tenantId, query);
    const rows = await this.prisma.userReport.findMany({
      where,
      orderBy: [{ reportDate: 'desc' }, { staffName: 'asc' }],
    });
    const waiterRows = rows.filter((row) => this.isWaiter(row.role));

    const [totalStaff, roleBreakdown, filters] = await Promise.all([
      this.prisma.staffMember.count({ where: { tenantId, deletedAt: null } }),
      this.getRoleBreakdown(tenantId),
      this.getUserReportFilters(currentUser),
    ]);

    return {
      stats: this.buildStats(totalStaff, rows),
      ...this.buildStats(totalStaff, rows),
      rows: rows.map((row) => this.toRowResponse(row)),
      waiterPerformance: waiterRows.map((row) => this.toRowResponse(row)),
      activitySummary: this.buildActivitySummary(rows),
      userActivitySummary: this.buildActivitySummary(rows),
      roleBreakdown,
      staffRoleBreakdown: roleBreakdown,
      filters,
    };
  }

  async getUserReportFilters(currentUser: ReportsCurrentUser) {
    const tenantId = this.requireTenantId(currentUser);
    const [reportRoles, staffRoles, periods] = await Promise.all([
      this.prisma.userReport.findMany({
        where: { tenantId, deletedAt: null, role: { not: '' } },
        select: { role: true },
        distinct: ['role'],
        orderBy: { role: 'asc' },
      }),
      this.prisma.staffMember.findMany({
        where: { tenantId, deletedAt: null, role: { not: '' } },
        select: { role: true },
        distinct: ['role'],
        orderBy: { role: 'asc' },
      }),
      this.prisma.userReport.findMany({
        where: { tenantId, deletedAt: null },
        select: { periodKey: true, periodLabel: true },
        distinct: ['periodKey', 'periodLabel'],
        orderBy: { periodKey: 'desc' },
      }),
    ]);

    const roles = this.uniqueRoles([
      ...reportRoles.map((row) => row.role),
      ...staffRoles.map((row) => row.role),
    ]);

    return {
      roles: roles.length ? roles : [...STAFF_MEMBER_ROLES],
      periods: periods.length
        ? periods.map((period) => ({
            key: period.periodKey,
            label: period.periodLabel,
          }))
        : [{ key: 'current-month', label: 'Current Month' }],
    };
  }

  async syncCurrentUserReports(currentUser: ReportsCurrentUser) {
    const tenantId = this.requireTenantId(currentUser);
    const period = this.currentPeriod();
    const staffMembers = await this.prisma.staffMember.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'Active',
      },
      orderBy: { fullName: 'asc' },
    });

    const syncedRows = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const staffMember of staffMembers) {
        const existing = await tx.userReport.findFirst({
          where: {
            tenantId,
            staffMemberId: staffMember.id,
            periodKey: period.key,
            deletedAt: null,
          },
        });

        if (existing) {
          rows.push(
            await tx.userReport.update({
              where: { id: existing.id },
              data: {
                staffName: staffMember.fullName,
                role: staffMember.role,
                periodLabel: period.label,
              },
            }),
          );
          continue;
        }

        rows.push(
          await tx.userReport.create({
            data: {
              tenantId,
              staffMemberId: staffMember.id,
              staffName: staffMember.fullName,
              role: staffMember.role,
              periodKey: period.key,
              periodLabel: period.label,
              ordersServed: 0,
              revenueHandled: new Prisma.Decimal(0),
              tablesServed: 0,
              shiftsWorked: 0,
              reportDate: new Date(),
              createdById: currentUser.id ?? null,
            },
          }),
        );
      }
      return rows;
    });

    return {
      periodKey: period.key,
      periodLabel: period.label,
      synced: syncedRows.length,
      rows: syncedRows.map((row) => this.toRowResponse(row)),
    };
  }

  async exportUserReports(
    currentUser: ReportsCurrentUser,
    query: UserReportQueryDto = {},
  ) {
    const data = await this.findUserReports(currentUser, query);
    return {
      generatedAt: new Date().toISOString(),
      ...data,
      data,
    };
  }

  async findOrderReport(
    currentUser: ReportsCurrentUser,
    query: OrderReportQueryDto = {},
  ) {
    return this.calculateAndSaveOrderReport(currentUser, query);
  }

  async syncOrderReport(
    currentUser: ReportsCurrentUser,
    query: OrderReportQueryDto = {},
  ) {
    return this.calculateAndSaveOrderReport(currentUser, query);
  }

  async exportOrderReport(
    currentUser: ReportsCurrentUser,
    query: OrderReportQueryDto = {},
  ) {
    const data = await this.calculateAndSaveOrderReport(currentUser, query);
    return {
      generatedAt: new Date().toISOString(),
      ...data,
      data,
    };
  }

  async getOrderReportFilters(currentUser: ReportsCurrentUser) {
    const tenantId = this.requireTenantId(currentUser);
    const savedPeriods = await this.prisma.orderReport.findMany({
      where: { tenantId, deletedAt: null },
      select: { periodKey: true, periodLabel: true },
      distinct: ['periodKey', 'periodLabel'],
      orderBy: { periodKey: 'desc' },
    });
    const current = this.resolvePeriod();
    const periods = this.uniquePeriods([
      { key: current.key, label: current.label },
      ...savedPeriods.map((period) => ({
        key: period.periodKey,
        label: period.periodLabel,
      })),
    ]);

    return { periods };
  }

  private requireTenantId(currentUser: ReportsCurrentUser) {
    const tenantId = currentUser?.tenantId?.trim();
    if (!currentUser?.id || !tenantId) {
      throw new UnauthorizedException(
        'Manager account is not connected to a restaurant.',
      );
    }
    return tenantId;
  }

  private async calculateAndSaveOrderReport(
    currentUser: ReportsCurrentUser,
    query: OrderReportQueryDto,
  ) {
    const tenantId = this.requireTenantId(currentUser);
    const period = this.resolvePeriod(query.period);
    const report = await this.calculateOrderReport(tenantId, period);

    await this.prisma.orderReport.upsert({
      where: {
        tenantId_periodKey: {
          tenantId,
          periodKey: period.key,
        },
      },
      create: {
        tenantId,
        periodKey: period.key,
        periodLabel: period.label,
        totalMonthlyOrders: report.stats.totalMonthlyOrders,
        revenue: new Prisma.Decimal(report.stats.revenue),
        qrScans: report.stats.qrScans,
        pendingPayments: new Prisma.Decimal(report.stats.pendingPayments),
        collectedRevenue: new Prisma.Decimal(
          report.paymentSummary.collectedRevenue,
        ),
        taxCollected: new Prisma.Decimal(report.paymentSummary.taxCollected),
        serviceCharges: new Prisma.Decimal(report.paymentSummary.serviceCharges),
        salesOverview: report.salesOverview as Prisma.InputJsonValue,
        paymentSummary: report.paymentSummary as Prisma.InputJsonValue,
        peakHours: report.peakHours as Prisma.InputJsonValue,
        qrUsage: report.qrUsage as Prisma.InputJsonValue,
        topSellingItems: report.topSellingItems as Prisma.InputJsonValue,
        orderStatusMix: report.orderStatusMix as Prisma.InputJsonValue,
        reportDate: new Date(),
        createdById: currentUser.id ?? null,
      },
      update: {
        periodLabel: period.label,
        totalMonthlyOrders: report.stats.totalMonthlyOrders,
        revenue: new Prisma.Decimal(report.stats.revenue),
        qrScans: report.stats.qrScans,
        pendingPayments: new Prisma.Decimal(report.stats.pendingPayments),
        collectedRevenue: new Prisma.Decimal(
          report.paymentSummary.collectedRevenue,
        ),
        taxCollected: new Prisma.Decimal(report.paymentSummary.taxCollected),
        serviceCharges: new Prisma.Decimal(report.paymentSummary.serviceCharges),
        salesOverview: report.salesOverview as Prisma.InputJsonValue,
        paymentSummary: report.paymentSummary as Prisma.InputJsonValue,
        peakHours: report.peakHours as Prisma.InputJsonValue,
        qrUsage: report.qrUsage as Prisma.InputJsonValue,
        topSellingItems: report.topSellingItems as Prisma.InputJsonValue,
        orderStatusMix: report.orderStatusMix as Prisma.InputJsonValue,
        reportDate: new Date(),
      },
    });

    return report;
  }

  private async calculateOrderReport(tenantId: string, period: ReportPeriod) {
    const periodWhere: Prisma.OrderWhereInput = {
      tenantId,
      deletedAt: null,
      placedAt: { gte: period.from, lt: period.to },
    };

    const [orders, salesOrders, qrScanAggregate, qrCodes] = await Promise.all([
      this.prisma.order.findMany({
        where: periodWhere,
        include: {
          items: { where: { deletedAt: null } },
        },
        orderBy: { placedAt: 'asc' },
      }),
      this.prisma.order.findMany({
        where: {
          tenantId,
          deletedAt: null,
          placedAt: {
            gte: this.addMonths(this.startOfMonth(period.from), -5),
            lt: period.to,
          },
        },
        select: {
          placedAt: true,
          totalAmount: true,
        },
      }),
      this.prisma.qrCode.aggregate({
        where: { tenantId },
        _sum: { scanCount: true },
      }),
      this.prisma.qrCode.findMany({
        where: { tenantId },
        select: {
          id: true,
          label: true,
          table: { select: { number: true, label: true } },
        },
      }),
    ]);

    const paidOrders = orders.filter((order) =>
      this.isPaidStatus(order.paymentStatus),
    );
    const pendingOrders = orders.filter(
      (order) => !this.isPaidStatus(order.paymentStatus),
    );
    const revenue = this.sumOrders(orders, 'totalAmount');
    const pendingPayments = this.sumOrders(pendingOrders, 'totalAmount');
    const collectedRevenue = this.sumOrders(paidOrders, 'totalAmount');
    const taxCollected = this.sumOrders(orders, 'taxAmount');
    const serviceCharges = this.sumOrders(orders, 'serviceChargeAmount');
    const paymentSummary = {
      collectedRevenue,
      taxCollected,
      serviceCharges,
    };

    return {
      period: {
        key: period.key,
        label: period.label,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
      },
      stats: {
        totalMonthlyOrders: orders.length,
        revenue,
        qrScans: qrScanAggregate._sum.scanCount ?? 0,
        pendingPayments,
      },
      paymentSummary,
      salesOverview: this.buildSalesOverview(period, salesOrders),
      peakHours: this.buildPeakHours(orders),
      qrUsage: this.buildQrUsage(orders, qrCodes),
      topSellingItems: this.buildTopSellingItems(orders),
      orderStatusMix: this.buildOrderStatusMix(orders),
    };
  }

  private buildUserReportWhere(tenantId: string, query: UserReportQueryDto) {
    const where: Prisma.UserReportWhereInput = {
      tenantId,
      deletedAt: null,
    };

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { staffName: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } },
      ];
    }

    const role = query.role?.trim();
    if (role && role.toLowerCase() !== 'all') {
      where.role = { equals: role, mode: 'insensitive' };
    }

    const period = query.period?.trim();
    if (period && period.toLowerCase() !== 'all') {
      where.periodKey = period;
    }

    return where;
  }

  private buildStats(totalStaff: number, rows: UserReportRow[]) {
    const waiterRows = rows.filter((row) => this.isWaiter(row.role));
    const serviceRows = rows.filter((row) => this.isServiceRole(row.role));
    const orderRows = waiterRows.length
      ? waiterRows
      : serviceRows.length
        ? serviceRows
        : rows;

    return {
      totalStaff,
      waiterOrders: this.sum(orderRows, (row) => row.ordersServed),
      staffRevenue: this.sum(rows, (row) => Number(row.revenueHandled)),
      activeShifts: this.sum(rows, (row) => row.shiftsWorked),
    };
  }

  private buildActivitySummary(rows: UserReportRow[]) {
    if (!rows.length) {
      return {
        mostActiveWaiter: {
          value: 'No staff activity yet',
          helperText: '0 orders served',
        },
        highestRevenueHandled: {
          value: 'No revenue yet',
          helperText: this.formatRevenue(0),
        },
        mostTablesServed: {
          value: 'No tables served yet',
          helperText: '0 tables',
        },
        averageOrdersPerWaiter: {
          value: '0',
          helperText: 'No report rows yet',
        },
      };
    }

    const waiterRows = rows.filter((row) => this.isWaiter(row.role));
    const activeRows = waiterRows.length ? waiterRows : rows;
    const mostActive = this.maxBy(activeRows, (row) => row.ordersServed);
    const highestRevenue = this.maxBy(rows, (row) =>
      Number(row.revenueHandled),
    );
    const mostTables = this.maxBy(rows, (row) => row.tablesServed);
    const averageRows = waiterRows.length ? waiterRows : rows;
    const averageOrders =
      this.sum(averageRows, (row) => row.ordersServed) / averageRows.length;

    return {
      mostActiveWaiter: {
        value: mostActive?.staffName ?? 'No staff activity yet',
        helperText: `${mostActive?.ordersServed ?? 0} orders served`,
      },
      highestRevenueHandled: {
        value: highestRevenue?.staffName ?? 'No revenue yet',
        helperText: this.formatRevenue(
          Number(highestRevenue?.revenueHandled ?? 0),
        ),
      },
      mostTablesServed: {
        value: mostTables?.staffName ?? 'No tables served yet',
        helperText: `${mostTables?.tablesServed ?? 0} tables`,
      },
      averageOrdersPerWaiter: {
        value: averageOrders.toFixed(1),
        helperText: waiterRows.length
          ? 'Average orders per waiter'
          : 'Average orders per staff member',
      },
    };
  }

  private async getRoleBreakdown(tenantId: string) {
    const staffMembers = await this.prisma.staffMember.findMany({
      where: { tenantId, deletedAt: null },
      select: { role: true },
    });

    const counts = new Map<string, number>();
    for (const staff of staffMembers) {
      const role = staff.role?.trim() || 'Unassigned';
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }

    const max = Math.max(1, ...counts.values());
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([role, count]) => ({
        role,
        count,
        value: count,
        max,
      }));
  }

  private toRowResponse(row: UserReportRow) {
    const revenue = Number(row.revenueHandled);
    return {
      id: row.id,
      staffMemberId: row.staffMemberId,
      staff: row.staffName,
      role: row.role,
      orders: row.ordersServed,
      revenue,
      revenueLabel: this.formatRevenue(revenue),
      tables: row.tablesServed,
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
    };
  }

  private currentPeriod() {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = now.toLocaleString('en-US', { month: 'long' });
    return {
      key,
      label: `${month} ${now.getFullYear()}`,
    };
  }

  private resolvePeriod(periodKey?: string): ReportPeriod {
    const cleaned = periodKey?.trim();
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    if (cleaned && cleaned !== 'current-month' && cleaned.toLowerCase() !== 'all') {
      const match = cleaned.match(/^(\d{4})-(\d{2})$/);
      if (match) {
        year = Number(match[1]);
        month = Number(match[2]) - 1;
      }
    }

    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
    const label = `${from.toLocaleString('en-US', { month: 'long' })} ${from.getFullYear()}`;

    return { key, label, from, to };
  }

  private buildSalesOverview(
    period: ReportPeriod,
    orders: Array<{ placedAt: Date; totalAmount: Prisma.Decimal }>,
  ) {
    const months = Array.from({ length: 6 }, (_, index) =>
      this.addMonths(this.startOfMonth(period.from), index - 5),
    );
    const rows = new Map(
      months.map((month) => [
        this.periodKey(month),
        {
          periodKey: this.periodKey(month),
          label: month.toLocaleString('en-US', { month: 'short' }),
          orders: 0,
          revenue: 0,
        },
      ]),
    );

    for (const order of orders) {
      const key = this.periodKey(order.placedAt);
      const row = rows.get(key);
      if (row) {
        row.orders += 1;
        row.revenue += Number(order.totalAmount ?? 0);
      }
    }

    return Array.from(rows.values());
  }

  private buildPeakHours(
    orders: Array<{ placedAt: Date; totalAmount: Prisma.Decimal }>,
  ) {
    const rows = new Map<number, { hour: number; label: string; orders: number; revenue: number }>();
    for (const order of orders) {
      const hour = order.placedAt.getHours();
      const row = rows.get(hour) ?? {
        hour,
        label: `${String(hour).padStart(2, '0')}:00-${String((hour + 1) % 24).padStart(2, '0')}:00`,
        orders: 0,
        revenue: 0,
      };
      row.orders += 1;
      row.revenue += Number(order.totalAmount ?? 0);
      rows.set(hour, row);
    }

    return Array.from(rows.values())
      .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
      .slice(0, 4);
  }

  private buildQrUsage(
    orders: Array<{
      tableId: string | null;
      qrCodeId: string | null;
      totalAmount: Prisma.Decimal;
    }>,
    qrCodes: Array<{
      id: string;
      label: string;
      table: { number: string; label: string | null };
    }>,
  ) {
    const qrMap = new Map(qrCodes.map((qrCode) => [qrCode.id, qrCode]));
    const rows = new Map<string, { qrCodeId: string | null; table: string; orders: number; revenue: number }>();

    for (const order of orders) {
      const qrCode = order.qrCodeId ? qrMap.get(order.qrCodeId) : null;
      const key = order.qrCodeId ?? order.tableId ?? 'unknown';
      const row = rows.get(key) ?? {
        qrCodeId: order.qrCodeId ?? null,
        table:
          qrCode?.table?.label ??
          qrCode?.table?.number ??
          order.tableId ??
          'Unknown',
        orders: 0,
        revenue: 0,
      };
      row.orders += 1;
      row.revenue += Number(order.totalAmount ?? 0);
      rows.set(key, row);
    }

    return Array.from(rows.values()).sort((a, b) => b.orders - a.orders);
  }

  private buildTopSellingItems(
    orders: Array<{
      items: Array<{
        foodName: string;
        quantity: number;
        lineTotal: Prisma.Decimal;
      }>;
    }>,
  ) {
    const rows = new Map<string, { item: string; quantity: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items ?? []) {
        const name = item.foodName?.trim() || 'Unknown item';
        const row = rows.get(name.toLowerCase()) ?? {
          item: name,
          quantity: 0,
          revenue: 0,
        };
        row.quantity += item.quantity ?? 0;
        row.revenue += Number(item.lineTotal ?? 0);
        rows.set(name.toLowerCase(), row);
      }
    }

    return Array.from(rows.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 10);
  }

  private buildOrderStatusMix(orders: Array<{ orderStatus: string }>) {
    const rows = new Map<string, { status: string; count: number }>();
    for (const order of orders) {
      const status = order.orderStatus?.trim() || 'unknown';
      const row = rows.get(status.toLowerCase()) ?? { status, count: 0 };
      row.count += 1;
      rows.set(status.toLowerCase(), row);
    }

    return Array.from(rows.values()).sort((a, b) => b.count - a.count);
  }

  private sumOrders<T extends 'totalAmount' | 'taxAmount' | 'serviceChargeAmount'>(
    orders: Array<Record<T, Prisma.Decimal>>,
    field: T,
  ) {
    return orders.reduce((total, order) => total + Number(order[field] ?? 0), 0);
  }

  private isPaidStatus(status: string) {
    return status.trim().toLowerCase() === 'paid';
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private addMonths(date: Date, months: number) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  private periodKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private uniquePeriods(periods: Array<{ key: string; label: string }>) {
    const periodMap = new Map<string, { key: string; label: string }>();
    for (const period of periods) {
      if (period.key) {
        periodMap.set(period.key, period);
      }
    }
    return Array.from(periodMap.values()).sort((a, b) =>
      b.key.localeCompare(a.key),
    );
  }

  private uniqueRoles(roles: string[]) {
    const roleMap = new Map<string, string>();
    for (const role of roles) {
      const cleaned = role.trim().replace(/\s+/g, ' ');
      if (cleaned) {
        roleMap.set(cleaned.toLowerCase(), cleaned);
      }
    }
    return Array.from(roleMap.values()).sort((a, b) => a.localeCompare(b));
  }

  private isWaiter(role: string) {
    return role.trim().toLowerCase().includes('waiter');
  }

  private isServiceRole(role: string) {
    const normalized = role.trim().toLowerCase();
    return normalized === 'waiter' || normalized === 'counter';
  }

  private sum(rows: UserReportRow[], pick: (row: UserReportRow) => number) {
    return rows.reduce((total, row) => total + pick(row), 0);
  }

  private maxBy(rows: UserReportRow[], pick: (row: UserReportRow) => number) {
    return rows.reduce<UserReportRow | null>(
      (best, row) => (!best || pick(row) > pick(best) ? row : best),
      null,
    );
  }

  private formatRevenue(value: number) {
    return `Rs. ${Math.round(value).toLocaleString('en-US')}`;
  }
}
