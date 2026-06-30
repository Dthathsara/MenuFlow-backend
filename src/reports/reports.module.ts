import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersReportsController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, OrdersReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
