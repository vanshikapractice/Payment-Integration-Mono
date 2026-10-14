import bcrypt from 'bcryptjs';
import { config } from '@/config';
import { prisma } from '@/db/prisma';
import { AppError } from '@/middleware/errorHandler';
import { signJwt } from '@/utils/jwt';

const TOKEN_TTL_SECONDS = 60 * 60;

export interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Hash a dummy value so response time does not reveal whether the email exists.
    await bcrypt.hash(password, 10);
    throw AppError.unauthorized('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const token = signJwt(
    { sub: user.id, email: user.email },
    config.jwtSecret,
    TOKEN_TTL_SECONDS
  );

  return { token, user: { id: user.id, email: user.email, name: user.name } };
}
