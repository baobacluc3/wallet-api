import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_user_revoked', ['userId', 'revoked'])
@Index('IDX_refresh_tokens_family_revoked', ['familyId', 'revoked'])
@Index('IDX_refresh_tokens_expires_at', ['expiresAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string; //A refresh-token family is a chain of tokens created from the same login session.

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @Column({ name: 'replaced_by_token_id', type: 'integer', nullable: true })
  replacedByTokenId: number | null;

  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
