import { SetMetadata } from '@nestjs/common';

export const WALLET_OWNER_KEY = 'walletOwner';

export interface WalletOwnerOptions {
  source: 'params' | 'body';
  field: string;
}

export const WalletOwner = (options: WalletOwnerOptions) => {
  // Problem: wallet IDs appear in both route params and payment bodies, which a fixed guard cannot infer safely.
  // Why here: endpoint metadata tells WalletOwnerGuard exactly which wallet must belong to the authenticated user.
  // Nest reads this decorator's metadata when it executes the guard before the controller method.
  return SetMetadata(WALLET_OWNER_KEY, options);
};
