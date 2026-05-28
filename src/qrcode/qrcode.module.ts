import { Module } from '@nestjs/common';
import { QrCodeService } from './qrcode.service';
import { MenuModule } from '../menu/menu.module';
import {
  PublicQrController,
  TableController,
  QrCodeController,
} from './qrcode.controller';

@Module({
  imports: [MenuModule],
  controllers: [
    PublicQrController,
    TableController,
    QrCodeController,
  ],
  providers: [QrCodeService],
  exports: [QrCodeService],
})
export class QrCodeModule {}
