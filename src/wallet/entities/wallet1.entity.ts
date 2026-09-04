import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Transaction1 } from '../../transaction/entities/transaction1.entity';

@Entity('wallets1')
export class Wallet1 {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  balance: bigint;

  @Column()
  currency: string;

  @OneToMany(() => Transaction1, (transaction) => transaction.wallet)
  transactions: Transaction1[];

  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'userId' })
  user: User;

  //auto-increments on every update — used for optimistic locking, which matters a lot in a wallet/money context
  // (prevents two concurrent updates from silently overwriting each other's balance change)
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createAt: Date;
}