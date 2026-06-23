import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QrCodeService } from './qrcode.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { CreateTableDto, UpdateTableDto } from './dto/table.dto';
import { CreateGenerateQrCodeDto } from './dto/generate-qrcode.dto';
import {
  CreateQrCodeDto,
  UpdateQrCodeDto,
  AssignStaffDto,
} from './dto/qrcode.dto';

// ─── PUBLIC SCAN (no auth) ────────────────────────────────────────────────
@Controller('menu')
export class PublicQrController {
  constructor(private qrCodeService: QrCodeService) {}

  @Public()
  @Get(':slug')
  scan(@Param('slug') slug: string) {
    return this.qrCodeService.scanQrCode(slug);
  }
}

// ─── TABLES ───────────────────────────────────────────────────────────────
@Controller('admin/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TableController {
  constructor(private qrCodeService: QrCodeService) {}

  @Post()
  @Roles(Role.CLIENT_ADMIN)
  createTable(@Body() dto: CreateTableDto) {
    return this.qrCodeService.createTable(dto);
  }

  @Get('tenant/:tenantId')
  @Roles(Role.STAFF)
  findTablesByTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.qrCodeService.findTablesByTenant(tenantId);
  }

  @Get(':id')
  @Roles(Role.STAFF)
  findTableById(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrCodeService.findTableById(id);
  }

  @Patch(':id')
  @Roles(Role.CLIENT_ADMIN)
  updateTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.qrCodeService.updateTable(id, dto);
  }

  @Delete(':id')
  @Roles(Role.CLIENT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTable(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrCodeService.deleteTable(id);
  }
}

// ─── QR CODES ─────────────────────────────────────────────────────────────
@Controller('admin/qr-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QrCodeController {
  constructor(private qrCodeService: QrCodeService) {}

  @Post()
  @Roles(Role.CLIENT_ADMIN)
  createQrCode(@Body() dto: CreateQrCodeDto) {
    return this.qrCodeService.createQrCode(dto);
  }

  @Get('tenant/:tenantId')
  @Roles(Role.MANAGER)
  findQrCodesByTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.qrCodeService.findQrCodesByTenant(tenantId);
  }

  @Get(':id')
  @Roles(Role.STAFF)
  findQrCodeById(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrCodeService.findQrCodeById(id);
  }

  @Patch(':id')
  @Roles(Role.CLIENT_ADMIN)
  updateQrCode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQrCodeDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.qrCodeService.updateQrCode(id, dto, tenantId);
  }

  @Delete(':id')
  @Roles(Role.CLIENT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteQrCode(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrCodeService.deleteQrCode(id);
  }

  // ─── Staff assignment ──────────────────────────────────────────────────

  // Add staff to QR code (additive)
  @Post(':id/staff')
  @Roles(Role.CLIENT_ADMIN)
  assignStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignStaffDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.qrCodeService.assignStaff(id, dto, tenantId);
  }

  // Replace all staff on QR code
  @Patch(':id/staff')
  @Roles(Role.CLIENT_ADMIN)
  replaceStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignStaffDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.qrCodeService.replaceStaff(id, dto, tenantId);
  }

  // Remove a single staff member from QR code
  @Delete(':id/staff/:userId')
  @Roles(Role.CLIENT_ADMIN)
  @HttpCode(HttpStatus.OK)
  removeStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.qrCodeService.removeStaff(id, userId);
  }
}

@Controller('generate-qr-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GenerateQrCodeController {
  constructor(private qrCodeService: QrCodeService) {}

  @Get()
  @Roles(Role.STAFF)
  findGeneratedQrCodes(@CurrentUser() currentUser: any) {
    return this.qrCodeService.findGeneratedQrCodes(currentUser);
  }

  @Get('sections')
  @Roles(Role.STAFF)
  findGeneratedQrCodeSections(@CurrentUser() currentUser: any) {
    return this.qrCodeService.findGeneratedQrCodeSections(currentUser);
  }

  @Post()
  @Roles(Role.STAFF)
  createGeneratedQrCode(
    @Body() dto: CreateGenerateQrCodeDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.qrCodeService.createGeneratedQrCode(dto, currentUser);
  }

  @Delete(':id')
  @Roles(Role.STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGeneratedQrCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.qrCodeService.deleteGeneratedQrCode(id, currentUser);
  }
}
