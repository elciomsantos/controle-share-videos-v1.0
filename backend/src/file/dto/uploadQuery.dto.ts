import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { i18nValidationMessage } from "nestjs-i18n";

// SEC-ZIPSLIP (VULN-03/15): o nome do arquivo é persistido no banco e usado
// como entrada de zip e parte de headers — precisa bloquear path traversal
// (`..` como segmento), caminho absoluto (leading `/`), barra invertida
// (separador Windows) e caracteres de controle. Barras `/` internas são
// permitidas de propósito: são a funcionalidade de pastas do upload.
// \p{Cc} cobre caracteres de controle (inclui NUL) sem acionar no-control-regex.
const SAFE_FILE_NAME =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\p{Cc}\\]{1,255}$/u;

export class UploadQueryDTO {
  // Opcional por design: o primeiro chunk chega sem id e o FileService gera
  // um UUID (local.service.ts). Chunks seguintes reenviam o id retornado,
  // que é validado como UUID aqui e de novo no serviço.
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Matches(SAFE_FILE_NAME, {
    message: i18nValidationMessage("validation.fileNamePattern"),
  })
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunkIndex!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalChunks!: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}
