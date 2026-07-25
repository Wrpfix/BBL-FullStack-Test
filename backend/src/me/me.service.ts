import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /** id comes from the verified token's own subject — never client-supplied. */
  findOne(id: number) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, auth0Sub: true, email: true, createdAt: true },
    });
  }
}
