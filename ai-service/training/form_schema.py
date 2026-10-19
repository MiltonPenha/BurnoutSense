"""Official research instrument definitions; independent of the prototype API.

Source: Formulario.pdf (2026-10-19); ESB-eu: Carlotto & Câmara (2020),
Annex 1, https://doi.org/10.33448/rsd-v9i7.4013 (CC BY 4.0).
No data loading, imputation, scoring or participant logging occurs here.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from math import isfinite
from types import MappingProxyType
from typing import Literal


class SpecialValue(Enum):
    NOT_APPLICABLE = "Não se aplica"


class Dimension(Enum):
    DEF = "Desgaste emocional e físico"
    DIST = "Distanciamento"
    INEF = "Ineficácia da formação"


Group = Literal["eligibility", "academic", "routine", "demands", "support",
                "financial", "esbeu", "administrative"]
DataType = Literal["integer", "number", "category"]
Nature = Literal["nominal", "ordinal", "quantitative"]
Value = int | float | str | SpecialValue | None

INTENSITY_LABELS = ("Nada", "Pouco", "Moderadamente", "Bastante", "Extremamente")
ESBEU_LABELS = ("Nunca", "Raramente", "Às vezes", "Frequentemente", "Todos os dias")


@dataclass(frozen=True)
class FieldDefinition:
    identifier: str
    name: str
    question: str
    group: Group
    data_type: DataType
    nature: Nature
    form_order: int
    required: bool = True
    choices: tuple[str | int, ...] = ()
    minimum: int | float | None = None
    maximum: int | float | None = None
    unit: str | None = None
    allows_not_applicable: bool = False
    labels: tuple[str, ...] = ()
    instructions: str = ""
    dimension: Dimension | None = None
    item_order: int | None = None
    reverse_scored: bool | None = None


ELIGIBILITY_FIELDS = (
    FieldDefinition("consent", "Consentimento voluntário",
                    (
                        'Você leu as informações da pesquisa e concorda '
                        'voluntariamente em participar?'
                    ),
                    "eligibility", "category", "nominal", 1,
                    choices=("Sim, concordo em participar.", "Não concordo em participar.")),
    FieldDefinition("adult", "Idade mínima de 18 anos", "Você possui 18 anos ou mais?",
                    "eligibility", "category", "nominal", 2, choices=("Sim", "Não")),
    FieldDefinition("enrolled", "Matrícula na graduação",
                    "Atualmente você está matriculado(a) em um curso de graduação?",
                    "eligibility", "category", "nominal", 4, choices=("Sim", "Não")),
)


def _rating(identifier: str, name: str, question: str, group: Group,
            order: int, *, allows_na: bool = False,
            labels: tuple[str, ...] = INTENSITY_LABELS) -> FieldDefinition:
    return FieldDefinition(
        identifier, name, question, group, "integer", "ordinal", order,
        choices=(0, 1, 2, 3, 4), allows_not_applicable=allows_na, labels=labels,
        instructions=("Considere as últimas 4 semanas. "
                    "Escolha Não se aplica caso não tenha trabalhado ou estagiado nesse período."
                    if allows_na else "Considere as últimas 4 semanas."),
    )


CONTEXT_FIELDS = (
    FieldDefinition("age_range", "Faixa etária", "Qual é a sua faixa etária?",
                    "academic", "category", "ordinal", 5,
                    choices=("18 a 20 anos", "21 a 23 anos", "24 a 26 anos",
                            "27 a 30 anos", "31 a 40 anos", "Acima de 40 anos")),
    FieldDefinition("course_area", "Área do curso", "Em qual grande área seu curso se enquadra?",
                    "academic", "category", "nominal", 6,
                    choices=("Engenharias e Tecnologia", "Ciências Exatas", "Ciências da Saúde",
                            "Ciências Humanas e Sociais", "Administração, Gestão e Negócios",
                            "Comunicação e Artes", "Outra")),
    FieldDefinition("semester", "Semestre equivalente",
                    "Em qual semestre/período do curso você está?",
                    "academic", "integer", "quantitative", 7, minimum=1, maximum=12,
                    unit="semestre", instructions="Curso anual: considere 2 semestres por ano."),
    FieldDefinition("course_shift", "Turno do curso",
                    "Qual é predominantemente o turno do seu curso?",
                    "academic", "category", "nominal", 8,
                    choices=("Matutino", "Vespertino", "Noturno", "Integral", "Outro")),
    FieldDefinition("subject_count", "Quantidade de disciplinas",
                    "Quantas disciplinas você está cursando atualmente?",
                    "academic", "integer", "quantitative", 9, minimum=0, maximum=15,
                    unit="disciplina", instructions="Caso não curse disciplinas, informe 0."),
    FieldDefinition("mandatory_hours_week", "Atividades acadêmicas obrigatórias",
                    (
                        'Aproximadamente quantas horas por semana você passa '
                        'em aulas ou atividades acadêmicas obrigatórias?'
                    ),
                    "academic", "number", "quantitative", 10, minimum=0,
                    unit="hora/semana", instructions=(
                        'Não conte novamente essas horas na próxima pergunta. '
                        'Aceita 7,5 ou 7.5.'
                    )),
    FieldDefinition("independent_hours_week", "Estudos fora das aulas",
                    (
                        'Considerando uma semana acadêmica habitual, quantas '
                        'horas você dedica a estudos, trabalhos e atividades '
                        'acadêmicas fora do horário das aulas?'
                    ),
                    "academic", "number", "quantitative", 11, minimum=0,
                    unit="hora/semana", instructions=(
                        'Não repita as horas de atividades obrigatórias. '
                        'Aceita decimal.'
                    )),
    FieldDefinition("employment", "Situação profissional",
                    "Atualmente você exerce atividade profissional ou estágio além da graduação?",
                    "routine", "category", "nominal", 12,
                    choices=("Não, apenas estudo", "Sim, trabalho remunerado", "Sim, estágio",
                            "Sim, exerço mais de uma atividade profissional")),
    FieldDefinition("work_hours_week", "Horas de trabalho ou estágio",
                    "Em média, quantas horas por semana você dedica ao trabalho e/ou estágio?",
                    "routine", "number", "quantitative", 13, minimum=0,
                    unit="hora/semana", instructions=(
                        "Caso não trabalhe ou estagie, informe 0. Aceita decimal."
                    )),
    FieldDefinition("sleep_hours", "Horas médias de sono",
                    (
                        'Considerando as últimas 4 semanas, quantas horas '
                        'você dormiu, em média, por noite?'
                    ),
                    "routine", "number", "quantitative", 14, minimum=0,
                    unit="hora/dia", instructions=(
                        'Aceita 7,5 ou 7.5. Considere o principal período de '
                        'sono, mesmo durante o dia.'
                    )),
    _rating("sleep_quality", "Qualidade do sono",
            "Considerando as últimas 4 semanas, como você avalia a qualidade do seu sono?",
            "routine", 15, labels=("Muito ruim", "", "", "", "Muito boa")),
    FieldDefinition("physical_activity_days", "Frequência de atividade física",
                    "Em quantos dias de uma semana habitual você realiza atividade física?",
                    "routine", "category", "ordinal", 16,
                    choices=("0 dias", "1 dia", "2 dias", "3 dias", "4 dias",
                            "5 dias", "6 dias", "7 dias"),
                    unit="dia/semana"),
    _rating("subject_overload", "Sobrecarga de disciplinas",
            (
                'Quanto a quantidade de disciplinas cursadas tem representado '
                'uma sobrecarga para você?'
            ), "demands", 17),
    _rating("assessment_pressure", "Pressão de avaliações e prazos",
            (
                'Quanto as provas, avaliações e prazos de entrega têm '
                'pressionado sua rotina?'
            ), "demands", 18),
    _rating("extraclass_overload", "Sobrecarga extraclasse",
            (
                'Quanto os trabalhos e atividades realizadas fora do horário '
                'das aulas têm sobrecarregado sua rotina?'
            ), "demands", 19),
    _rating("study_rest_difficulty", "Conciliação de estudos e descanso",
            (
                'Quanto você tem encontrado dificuldade para conciliar '
                'estudos e momentos de descanso ou lazer?'
            ), "demands", 20),
    _rating("study_work_difficulty", "Conciliação de estudos e trabalho",
            (
                'Considerando as últimas 4 semanas, quanto você tem '
                'encontrado dificuldade para conciliar estudos com trabalho '
                'ou estágio?'
            ),
            "demands", 21, allows_na=True),
    _rating("teacher_difficulties", "Relação com professores",
            (
                'Em que nível dificuldades na relação com professores '
                'afetaram negativamente sua experiência acadêmica?'
            ), "support", 22),
    _rating("peer_difficulties", "Relação com colegas",
            (
                'Em que nível dificuldades na relação com colegas afetaram '
                'negativamente sua experiência acadêmica?'
            ), "support", 23),
    _rating("personal_support", "Apoio de colegas, amigos e familiares",
            (
                'Quanto você sente que possui apoio de colegas, amigos ou '
                'familiares quando enfrenta dificuldades acadêmicas?'
            ),
            "support", 24, labels=("Nenhum apoio", "", "", "", "Muito apoio")),
    _rating("academic_support", "Apoio no ambiente acadêmico",
            (
                'Quanto você sente que encontra apoio no ambiente acadêmico '
                'quando enfrenta dificuldades relacionadas aos estudos?'
            ),
            "support", 25, labels=("Nenhum apoio", "", "", "", "Muito apoio")),
    _rating("financial_concern", "Preocupações financeiras",
            (
                'Considerando as últimas 4 semanas, em que nível preocupações '
                'financeiras têm afetado sua rotina acadêmica?'
            ), "financial", 26),
)

_ESBEU_TEXTS = (
    "Sinto-me emocionalmente exausto(a) devido a meus estudos",
    "Após minhas aulas, sinto-me com pouca energia para realizar outras atividades",
    "Meus estudos têm feito com que eu me sinta fisicamente exausto(a)",
    "Sinto sensações físicas desagradáveis após um dia de estudo",
    "Após um dia de estudo eu penso somente em descansar",
    "Tenho dúvidas se terei energia suficiente para concluir meus estudos",
    "Penso em mudar de curso",
    "Com o decorrer do curso tenho descoberto que não é o que eu esperava",
    "Meu interesse pelo curso tem diminuído",
    "Alguns conteúdos de disciplinas me fazem questionar minha opção de curso",
    "Tenho dúvidas sobre a utilidade dos meus estudos",
    "Os conteúdos do meu curso não têm me proporcionado aprendizado",
    "Vejo pouca relação entre os conteúdos das disciplinas e uma futura prática profissional",
    (
        'O que tenho aprendido nas disciplinas do curso não parece ser '
        'importante para minha formação profissional'
    ),
)
_ITEM_DIMENSIONS = (Dimension.DEF,) * 6 + (Dimension.DIST,) * 4 + (Dimension.INEF,) * 4

ESBEU_FIELDS = tuple(
    FieldDefinition(
        f"esbeu_{i:02d}", f"ESB-eu item {i:02d}", text, "esbeu", "integer",
        "ordinal", i + 26, choices=(0, 1, 2, 3, 4), labels=ESBEU_LABELS,
        dimension=dimension, item_order=i, reverse_scored=False,
        instructions="Selecione a frequência correspondente à sua experiência.",
    )
    for i, (text, dimension) in enumerate(zip(_ESBEU_TEXTS, _ITEM_DIMENSIONS), 1)
)

ADMINISTRATIVE_FIELDS = (
    FieldDefinition("tcle_email", "E-mail do TCLE", "E-mail para recebimento da cópia do TCLE",
                    "administrative", "category", "nominal", 3, required=False,
                    instructions="Identificar e descartar antes de formar a base analítica."),
)
ANALYTICAL_FIELDS = ELIGIBILITY_FIELDS + CONTEXT_FIELDS + ESBEU_FIELDS
FIELDS_BY_ID = MappingProxyType({field.identifier: field for field in ANALYTICAL_FIELDS})
ESBEU_BY_DIMENSION = MappingProxyType({
    dimension: tuple(field.identifier for field in ESBEU_FIELDS if field.dimension == dimension)
    for dimension in Dimension
})
ADMINISTRATIVE_HEADERS = frozenset(
    value for field in ADMINISTRATIVE_FIELDS for value in (field.identifier, field.question)
)


class SchemaDefinitionError(ValueError):
    """The instrument's definitions are internally inconsistent."""


class ResponseValidationError(ValueError):
    """Diagnostics contain only known field identifiers and rules, never responses."""

    def __init__(self, field_id: str, reason: str) -> None:
        self.field_id = field_id
        self.reason = reason
        super().__init__(f"{field_id}: {reason}")


class IneligibleRecordError(ValueError):
    """The participation criteria are valid but include a negative answer."""


def validate_value(field_id: str, value: object) -> Value:
    """Validate canonical Python values; do not parse Google Forms strings.

    None is the sole missing marker. Invalid values raise an exception; zero
    stays zero. Only the documented NA alternative is canonicalized to an enum.
    """
    if field_id not in FIELDS_BY_ID:
        raise ResponseValidationError("record", "campo fora do esquema analítico")
    field = FIELDS_BY_ID[field_id]
    if value is None:
        if field.required:
            raise ResponseValidationError(field_id, "campo obrigatório ausente")
        return None
    if value is SpecialValue.NOT_APPLICABLE or (
        type(value) is str and value == SpecialValue.NOT_APPLICABLE.value
    ):
        if field.allows_not_applicable:
            return SpecialValue.NOT_APPLICABLE
        raise ResponseValidationError(field_id, "alternativa Não se aplica não permitida")
    expected_types = {"integer": (int,), "number": (int, float), "category": (str,)}
    if type(value) not in expected_types[field.data_type]:
        raise ResponseValidationError(field_id, f"tipo esperado: {field.data_type}")
    if field.data_type == "number" and type(value) is float and not isfinite(value):
        raise ResponseValidationError(field_id, "número deve ser finito")
    if field.choices and value not in field.choices:
        raise ResponseValidationError(field_id, "alternativa desconhecida")
    if field.minimum is not None and value < field.minimum:
        raise ResponseValidationError(field_id, "valor inferior ao mínimo permitido")
    if field.maximum is not None and value > field.maximum:
        raise ResponseValidationError(field_id, "valor superior ao máximo permitido")
    return value


def is_eligible(record: Mapping[str, object]) -> bool:
    """Check the three criteria; malformed/missing criteria raise validation errors."""
    values = tuple(validate_value(field.identifier, record.get(field.identifier))
                for field in ELIGIBILITY_FIELDS)
    return values == ("Sim, concordo em participar.", "Sim", "Sim")


def validate_record(record: Mapping[str, object]) -> dict[str, Value]:
    """Require a complete eligible canonical record, rejecting extra/admin columns."""
    if any(key in ADMINISTRATIVE_HEADERS for key in record):
        raise ResponseValidationError("record", "campo administrativo deve ser descartado")
    if any(key not in FIELDS_BY_ID for key in record):
        raise ResponseValidationError("record", "campo fora do esquema analítico")
    if not is_eligible(record):
        raise IneligibleRecordError("Registro não atende aos critérios de participação.")
    validated = {field.identifier: validate_value(field.identifier, record.get(field.identifier))
                for field in ANALYTICAL_FIELDS}
    if (validated["employment"] == "Não, apenas estudo"
            and validated["work_hours_week"] != 0):
        raise ResponseValidationError("work_hours_week", "sem trabalho ou estágio, informe 0")
    return validated


def validate_schema(fields: tuple[FieldDefinition, ...] = ANALYTICAL_FIELDS) -> None:
    """Fail fast on instrument drift, including item identity and dimension mapping."""
    identifiers = [field.identifier for field in fields]
    if len(identifiers) != len(set(identifiers)):
        raise SchemaDefinitionError("Identificadores duplicados.")
    if len(fields) != 39 or set(identifiers) != set(FIELDS_BY_ID):
        raise SchemaDefinitionError("Esperados os 39 identificadores analíticos oficiais.")
    counts = Counter(field.group for field in fields)
    if counts != {"eligibility": 3, "academic": 7, "routine": 5,
                "demands": 5, "support": 4, "financial": 1, "esbeu": 14}:
        raise SchemaDefinitionError("Distribuição dos grupos incompatível com o formulário.")
    if sorted(field.form_order for field in fields) != [1, 2, *range(4, 41)]:
        raise SchemaDefinitionError("Ordens físicas do formulário inconsistentes.")
    for field in fields:
        if not field.name or not field.question or not field.required:
            raise SchemaDefinitionError(f"{field.identifier}: metadados obrigatórios ausentes.")
        if field.data_type not in ("integer", "number", "category"):
            raise SchemaDefinitionError(f"{field.identifier}: tipo desconhecido.")
        if field.nature not in ("nominal", "ordinal", "quantitative"):
            raise SchemaDefinitionError(f"{field.identifier}: natureza desconhecida.")
        if field.minimum is not None and field.maximum is not None:
            if field.minimum > field.maximum:
                raise SchemaDefinitionError(f"{field.identifier}: intervalo invertido.")
        if len(set(field.choices)) != len(field.choices):
            raise SchemaDefinitionError(f"{field.identifier}: alternativas duplicadas.")
        if field.labels and len(field.labels) != len(field.choices):
            raise SchemaDefinitionError(
                f"{field.identifier}: rótulos incompatíveis com o domínio."
            )
        if field.group == "esbeu":
            index = field.item_order
            if (type(index) is not int or not 1 <= index <= 14
                    or field.identifier != f"esbeu_{index:02d}"
                    or field.dimension != _ITEM_DIMENSIONS[index - 1]
                    or field.question != _ESBEU_TEXTS[index - 1]
                    or field.choices != (0, 1, 2, 3, 4)
                    or field.reverse_scored is not False):
                raise SchemaDefinitionError(f"{field.identifier}: item ESB-eu inconsistente.")
        official = FIELDS_BY_ID[field.identifier]
        if field != official:
            raise SchemaDefinitionError(
                f"{field.identifier}: definição difere do instrumento oficial."
            )
    dimensions = Counter(field.dimension for field in fields if field.group == "esbeu")
    if dimensions != {Dimension.DEF: 6, Dimension.DIST: 4, Dimension.INEF: 4}:
        raise SchemaDefinitionError("ESB-eu deve conter 6/4/4 itens por dimensão.")


validate_schema()
