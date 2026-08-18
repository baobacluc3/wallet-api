import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  password_hash: string;

  @Column()
  name: string;

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet;
}
