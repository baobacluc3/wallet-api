import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { TransferService } from './transfer.service';

@Controller('transfer')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}
}
