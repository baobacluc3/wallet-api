import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';

export enum TransferStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('transfers')
@Check('CHK_transfers_amount_positive', '"amount_cents" > 0')
@Check('CHK_transfers_distinct_wallets', '"from_wallet_id" <> "to_wallet_id"')
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'from_wallet_id', type: 'integer' })
  fromWalletId: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.sentTransfers, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'from_wallet_id' })
  fromWallet: Wallet;

  @Column({ name: 'to_wallet_id', type: 'integer' })
  toWalletId: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.receivedTransfers, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'to_wallet_id' })
  toWallet: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.transfer)
  transactions: Transaction[];

  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents: number;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    unique: true,
  })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: TransferStatus,
    enumName: 'transfer_status_enum',
    default: TransferStatus.PENDING,
  })
  status: TransferStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
