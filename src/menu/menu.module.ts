import { Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import {
  PublicMenuController,
  MenuController,
  CategoryController,
  MenuItemController,
  MenuItemOptionController,
} from './menu.controller';

@Module({
  controllers: [
    PublicMenuController,
    MenuController,
    CategoryController,
    MenuItemController,
    MenuItemOptionController,
  ],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}