import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Transfer } from '../../transfer/entities/transfer.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';

@Entity('wallets')
@Check('CHK_wallets_balance_non_negative', '"balance_cents" >= 0')
@Check('CHK_wallets_currency_iso_4217', '"currency" ~ \'^[A-Z]{3}$\'')
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  // Amounts use integer minor units (for example cents), never floating point.
  @Column({ name: 'balance_cents', type: 'integer', default: 0 })
  balanceCents: number;

  @Column({ name: 'user_id', type: 'integer', unique: true })
  userId: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @VersionColumn({ type: 'integer', default: 1 })
  version: number;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  @OneToMany(() => Transfer, (transfer) => transfer.fromWallet)
  sentTransfers: Transfer[];

  @OneToMany(() => Transfer, (transfer) => transfer.toWallet)
  receivedTransfers: Transfer[];

  @OneToOne(() => User, (user) => user.wallet, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
