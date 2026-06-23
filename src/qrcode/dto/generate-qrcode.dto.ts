import { IsNotEmpty, IsString } from 'class-validator';

export class CreateGenerateQrCodeDto {
  @IsString()
  @IsNotEmpty()
  tableNumber: string;

  @IsString()
  @IsNotEmpty()
  section: string;
}
