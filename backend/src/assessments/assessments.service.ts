import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Historical storage is preserved; new ESB-eu persistence requires its own migration. */
@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(_userId: string): never {
    throw new GoneException('Fluxo diário anterior retirado. Use o contrato contextual ESB-eu em /ai/predict.');
  }

  updateByUser(_userId: string, _id: string): never {
    throw new GoneException('Atualização do formato anterior retirada; integração de persistência ESB-eu pendente.');
  }

  findAllByUser(userId: string) {
    return this.prisma.assessment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async findOneByUser(userId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({ where: { id, userId } });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    return assessment;
  }

  async deleteByUser(userId: string, id: string) {
    await this.findOneByUser(userId, id);
    await this.prisma.assessment.delete({ where: { id } });
  }
}
