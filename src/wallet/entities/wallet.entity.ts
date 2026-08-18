import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Transfer } from '../../transfer/entities/transfer.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  balance: number;

  @Column()
  currency: string;

  @Column()
  version: number;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  @OneToMany(() => Transfer, (transfer) => transfer.fromWallet)
  sentTransfers: Transfer[];

  @OneToMany(() => Transfer, (transfer) => transfer.toWallet)
  receivedTransfers: Transfer[];

  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
