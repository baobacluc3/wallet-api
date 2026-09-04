import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { Role } from '../enums/role.enum';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { AuthEvent } from '../../auth/entities/auth-event.entity';

@Entity('users')
@Check(
  'CHK_users_failed_login_attempts_non_negative',
  '"failed_login_attempts" >= 0',
)
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  // Emails are normalised to lowercase by AuthService; the migration also adds
  // a case-insensitive unique index as the final protection against duplicates.
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet;

  @Column({
    type: 'enum',
    enum: Role,
    enumName: 'user_role_enum',
    default: Role.USER,
  })
  role: Role;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => AuthEvent, (event) => event.user)
  authEvents: AuthEvent[];

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'failed_login_attempts', type: 'integer', default: 0 })
  failedLoginAttempts: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
