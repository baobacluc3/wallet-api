import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class WalletOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const walletId = Number(
      request.params.id ??
        request.params.walletId ??
        request.body?.walletId ??
        request.body?.fromWalletId,
    );
    const user = request.user;
    if (!Number.isSafeInteger(walletId) || walletId < 1) {
      throw new BadRequestException('A valid wallet ID is required');
    }
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.userId !== user.id) {
      throw new ForbiddenException('You do not own this wallet');
    }

    return true;
  }
}
