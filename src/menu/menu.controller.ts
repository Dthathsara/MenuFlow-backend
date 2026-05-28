import {
  Controller, Get, Post, Patch, Delete, Param,
  Body, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { AddMenuItemsService } from './add-menu-items.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateSubCategoryDto, UpdateSubCategoryDto, CreateManagerCategoryDto,
} from './dto/category.dto';
import {
  UpdateMenuItemOptionDto, UpdatePriceDto,
  AddMenuItemsQueryDto, CreateAddMenuItemDto, UpdateAddMenuItemDto,
} from './dto/menu-item.dto';
import { CreateQrCodeDto, UpdateQrCodeDto } from './dto/qr-code.dto';

// ─── PUBLIC ROUTE (no auth — scanned from QR code) ────────────────────────
@Controller('menu')
export class PublicMenuController {
  constructor(private addMenuItemsService: AddMenuItemsService) {}

  @Public()
  @Get(':slug')
  getPublicMenu(@Param('slug') slug: string) {
    return this.addMenuItemsService.getCustomerMenu({ slug });
  }
}

@Controller('customer-menu')
export class CustomerMenuController {
  constructor(private addMenuItemsService: AddMenuItemsService) {}

  @Public()
  @Get()
  getCustomerMenu(
    @Query('tenantId') tenantId?: string,
    @Query('slug') slug?: string,
  ) {
    return this.addMenuItemsService.getCustomerMenu({ tenantId, slug });
  }
}

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────
@Controller('admin/menus')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuController {
  constructor(private menuService: MenuService) {}

  @Post()
  @Roles(Role.CLIENT_ADMIN)
  createMenu(@Body() dto: CreateMenuDto) {
    return this.menuService.createMenu(dto);
  }

  @Get('tenant/:tenantId')
  @Roles(Role.STAFF)
  findMenusByTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.menuService.findMenusByTenant(tenantId);
  }

  @Get(':id')
  @Roles(Role.STAFF)
  findMenuById(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.findMenuById(id);
  }

  @Patch(':id')
  @Roles(Role.CLIENT_ADMIN)
  updateMenu(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menuService.updateMenu(id, dto);
  }

  @Delete(':id')
  @Roles(Role.CLIENT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMenu(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.deleteMenu(id);
  }
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryController {
  constructor(private menuService: MenuService) {}

  @Post()
  @Roles(Role.CLIENT_ADMIN)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.menuService.createCategory(dto);
  }

  @Get()
  @Roles(Role.STAFF)
  findManagerCategories(@CurrentUser('id') userId: string) {
    return this.menuService.findManagerCategories(userId);
  }

  @Get('tenant/:tenantId')
  @Roles(Role.STAFF)
  findCategoriesByTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.menuService.findCategoriesByTenant(tenantId);
  }

  @Patch(':id')
  @Roles(Role.CLIENT_ADMIN)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.menuService.updateCategory(id, dto);
  }

  @Delete(':id')
  @Roles(Role.CLIENT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.deleteCategory(id);
  }

  @Post('sub')
  @Roles(Role.CLIENT_ADMIN)
  createSubCategory(@Body() dto: CreateSubCategoryDto) {
    return this.menuService.createSubCategory(dto);
  }

  @Patch('sub/:id')
  @Roles(Role.CLIENT_ADMIN)
  updateSubCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubCategoryDto,
  ) {
    return this.menuService.updateSubCategory(id, dto);
  }

  @Delete('sub/:id')
  @Roles(Role.CLIENT_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSubCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.deleteSubCategory(id);
  }
}

// ─── MENU ITEMS ───────────────────────────────────────────────────────────
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoryAliasController {
  constructor(private menuService: MenuService) {}

  @Post()
  @Roles(Role.STAFF)
  createManagerCategory(
    @Body() dto: CreateManagerCategoryDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.menuService.createManagerCategory(dto, currentUser);
  }

  @Get()
  @Roles(Role.STAFF)
  findManagerCategories(@CurrentUser() currentUser: any) {
    return this.menuService.findManagerCategories(currentUser);
  }
}

@Controller('menu-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuItemAliasController {
  constructor(private addMenuItemsService: AddMenuItemsService) {}

  @Post()
  @Roles(Role.STAFF)
  createMenuItem(
    @Body() dto: CreateAddMenuItemDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.addMenuItemsService.create(dto, currentUser);
  }

  @Get()
  @Roles(Role.STAFF)
  findManagerMenuItems(
    @Query() query: AddMenuItemsQueryDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.addMenuItemsService.findAll(currentUser, query);
  }

  @Get('categories')
  @Roles(Role.STAFF)
  findManagerMenuItemCategories(@CurrentUser() currentUser: any) {
    return this.addMenuItemsService.findCategories(currentUser);
  }

  @Patch(':id')
  @Roles(Role.STAFF)
  updateMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddMenuItemDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.addMenuItemsService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Roles(Role.STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.addMenuItemsService.softDelete(id, currentUser);
  }
}

@Controller('admin/menu-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuItemController {
  constructor(private menuService: MenuService) {}

  @Post()
  @Roles(Role.STAFF)
  createMenuItem(
    @Body() dto: CreateAddMenuItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.menuService.createManagerMenuItem(dto, userId);
  }

  @Get()
  @Roles(Role.STAFF)
  findManagerMenuItems(
    @Query() query: AddMenuItemsQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.menuService.findManagerMenuItems(userId, query);
  }

  @Get('categories')
  @Roles(Role.STAFF)
  findManagerMenuItemCategories(@CurrentUser('id') userId: string) {
    return this.menuService.findManagerCategories(userId);
  }

  @Get('menu/:menuId')
  @Roles(Role.STAFF)
  findMenuItems(@Param('menuId', ParseUUIDPipe) menuId: string) {
    return this.menuService.findMenuItems(menuId);
  }

  @Get(':id')
  @Roles(Role.STAFF)
  findMenuItemById(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.findMenuItemById(id);
  }

  @Patch(':id')
  @Roles(Role.STAFF)
  updateMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddMenuItemDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.menuService.updateManagerMenuItem(id, dto, userId);
  }

  @Patch(':id/availability')
  @Roles(Role.STAFF)
  toggleAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.menuService.toggleAvailability(id, userId);
  }

  @Delete(':id')
  @Roles(Role.STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.menuService.deleteManagerMenuItem(id, userId);
  }
}

// ─── OPTIONS & PRICING ────────────────────────────────────────────────────
@Controller('admin/options')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuItemOptionController {
  constructor(private menuService: MenuService) {}

  @Patch(':id')
  @Roles(Role.STAFF)
  updateOption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemOptionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.menuService.updateOption(id, dto, userId);
  }

  @Patch(':id/price')
  @Roles(Role.CLIENT_ADMIN)
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.menuService.updateOptionPrice(id, dto, userId);
  }

  @Get(':id/price-history')
  @Roles(Role.STAFF)
  getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.getPriceHistory(id);
  }
}

