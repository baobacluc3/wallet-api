import {
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

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Wallet, (wallet) => wallet.sent_transfers)
  @JoinColumn({ name: 'from_wallet_id' })
  from_wallet: Wallet;

  @ManyToOne(() => Wallet, (wallet) => wallet.received_transfers)
  @JoinColumn({ name: 'to_wallet_id' })
  to_wallet: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.transfer)
  transactions: Transaction[];

  @Column()
  amount: number;

  @Column()
  status: string;

  @Column()
  reference: string;

  @CreateDateColumn()
  created_at: Date;
}
