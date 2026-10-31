import { GoneException, Injectable } from '@nestjs/common';

@Injectable()
export class ResultsService {
  findByAssessmentId(_userId: string, _assessmentId: string): never {
    throw new GoneException('Resultados anteriores retirados; resultados ESB-eu exigem a nova integração de persistência.');
  }

  generateInsights(_userId: string, _assessmentId: string): never {
    throw new GoneException('Geração externa de insights retirada. Respostas de pesquisa permanecem no ambiente controlado.');
  }
}
