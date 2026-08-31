import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class WalletIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    // Problem: route parameters arrive as strings, but wallet repository lookups require a valid numeric ID.
    // Why here: only routes addressing one wallet need this domain-specific validation and conversion.
    // Nest executes parameter pipes after guards and before the controller method is called.
    const walletId = Number(value);
    if (!Number.isSafeInteger(walletId) || walletId < 1) {
      throw new BadRequestException('wallet id must be a positive integer');
    }

    return walletId;
  }
}
