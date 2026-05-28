import { Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import { AddMenuItemsService } from './add-menu-items.service';
import {
  PublicMenuController,
  CustomerMenuController,
  MenuController,
  CategoryController,
  CategoryAliasController,
  MenuItemAliasController,
  MenuItemController,
  MenuItemOptionController,
} from './menu.controller';

@Module({
  controllers: [
    PublicMenuController,
    CustomerMenuController,
    MenuController,
    CategoryController,
    CategoryAliasController,
    MenuItemAliasController,
    MenuItemController,
    MenuItemOptionController,
  ],
  providers: [MenuService, AddMenuItemsService],
  exports: [MenuService, AddMenuItemsService],
})
export class MenuModule {}
