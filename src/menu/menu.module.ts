import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
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
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
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
