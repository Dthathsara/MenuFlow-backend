import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { STAFF_MEMBER_ROLES } from '../staff/dto/create-staff-member.dto';
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

    const [totalStaff, roleBreakdown, filters] = await Promise.all([
      this.prisma.staffMember.count({ where: { tenantId, deletedAt: null } }),
      this.getRoleBreakdown(tenantId),
      this.getUserReportFilters(currentUser),
    ]);

    return {
      stats: this.buildStats(totalStaff, rows),
      rows: rows.map((row) => this.toRowResponse(row)),
      activitySummary: this.buildActivitySummary(rows),
      roleBreakdown,
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
    return {
      generatedAt: new Date().toISOString(),
      data: await this.findUserReports(currentUser, query),
    };
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
    return role.trim().toLowerCase() === 'waiter';
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
