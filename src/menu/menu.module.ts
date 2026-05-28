import { Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import {
  PublicMenuController,
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
    MenuController,
    CategoryController,
    CategoryAliasController,
    MenuItemAliasController,
    MenuItemController,
    MenuItemOptionController,
  ],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
