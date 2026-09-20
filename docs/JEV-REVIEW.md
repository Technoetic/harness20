# Step 25 선택형 Jev 보조 검토

Step 25에서 선택한 기획 발췌문이 주제의 개별 요구사항을 반영하는지 Jev로 추가 검토할 수 있습니다. Claude Code와 Codex 모두 같은 Node CLI를 사용합니다. Node.js 22 이상이 필요하며 별도 TypeSafe SDK는 설치하지 않습니다.

**사용자가 이 보조 검토와 선택한 내용의 외부 전송을 명시적으로 선택한 경우에만** 실행합니다. 에이전트는 API 키가 설정되어 있거나 Step 25에 도달했다는 이유로 선택을 추정하면 안 됩니다. 실제 전송에는 별도로 `run --allow-network`가 필요합니다. 기본 동작과 `prepare`, `inspect`는 API를 호출하지 않습니다.

## 검토 범위와 결과의 의미

이 검토는 `role: advisory`, `step: 25`인 보조 자료입니다. 기존 작성자·검증자 분리, 필수 Acceptance, 주제 일치·타깃 적합성·인터랙티브 충족·사례 반영의 네 축, 완료 게이트와 권한 확인은 그대로 적용됩니다. Jev 결과나 CLI 종료 코드 0으로 Step 25를 PASS 처리하거나 다음 단계로 이동하지 않습니다.

각 요구사항의 Choice 결과는 다음 세 가지입니다.

| 결과 | 의미 |
|---|---|
| `met` | 선택한 기획 발췌문이 해당 요구사항을 충족한다고 모델이 판정 |
| `unmet` | 선택한 기획 발췌문이 요구사항과 명시적으로 충돌한다고 모델이 판정 |
| `insufficient_evidence` | 선택한 발췌문으로 판정할 근거가 부족함 |

확률분포와 `confidence`는 실제 정답률을 보장하지 않습니다. 한국어 등 CJK에서는 영어보다 성능이 낮을 수 있고, 입력에 섞인 지시 문구가 판정에 영향을 줄 수 있습니다. 숫자 계산·날짜 비교·파일 존재·해시·JSON 구조처럼 코드로 확인할 항목은 기존 로컬 검사로 검증합니다. 기획 전체나 조사 전체에 대한 품질 보증으로 확대 해석하지 않습니다.

## 전송할 입력 선택

입력은 다음 JSON 스키마를 사용하며 알 수 없는 필드는 거부합니다. 키나 인증 설정을 입력 JSON에 넣지 않습니다.

```json
{
  "schema_version": 1,
  "topic_excerpt": "The page must provide a year filter.",
  "planning": [
    {
      "path": "step_archive/step025_planning_chunk1.md",
      "excerpt": "A year filter is provided above the chart."
    }
  ],
  "requirements": [
    {
      "id": "year-filter",
      "text": "The page must provide a year filter."
    }
  ]
}
```

- `topic_excerpt`는 해당 작업 공간의 `step_archive/TOPIC/TOPIC.md` 안에 **정확히 포함된 연속 문자열**이어야 합니다.
- 각 `planning[].path`에는 선택한 원본 `step_archive/step025_*.md`의 작업 공간 기준 상대경로를 명시합니다. `excerpt`는 그 파일에 정확히 포함된 연속 문자열이어야 합니다.
- 각 `requirements[].text`는 선택한 `topic_excerpt`에 정확히 포함되어야 합니다. 요약·번역·공백 변경으로 새 문장을 만들지 않습니다. 요구사항 ID는 중복 없이 지정합니다.
- 기획 파일은 최대 4개, 요구사항은 최대 12개입니다. 입력·전송 본문·응답은 각각 64 KiB, 원본 파일은 각각 256 KiB, 로컬 원본 읽기 합계는 1 MiB로 제한합니다. 경로 이탈·링크 파일·잘못된 UTF-8은 거부합니다.

외부로 전송하는 내용은 선택한 텍스트와 판정 기준·ID입니다. 원본 경로와 해시는 로컬 출처 대조에 사용합니다. 파일 전체를 자동 수집하지 않습니다. 공개 자료 또는 외부 전송이 허용된 비민감 발췌문을 직접 선택하세요. 자격증명으로 보이는 문자열을 차단하는 검사는 모든 민감정보를 찾아내는 기능이 아닙니다.

## 공개 가상 예제로 준비하기

다음 PowerShell 예제는 **harness50 저장소 루트**에서 실행합니다. 기존 프로젝트와 분리된 임시 작업 공간에 공개 가상 자료를 만들며 API를 호출하지 않습니다. 실제 프로젝트에서는 `$workspaceRoot`를 해당 작업 공간으로 바꾸고 위 스키마대로 선택한 입력 파일을 준비합니다.

```powershell
$workspaceRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('harness50-jev-example-' + [guid]::NewGuid().ToString('N'))
$utf8Encoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.Directory]::CreateDirectory((Join-Path $workspaceRoot 'step_archive/TOPIC')) | Out-Null
[System.IO.File]::WriteAllText((Join-Path $workspaceRoot 'step_archive/TOPIC/TOPIC.md'), "The page must provide a year filter.`n", $utf8Encoding)
[System.IO.File]::WriteAllText((Join-Path $workspaceRoot 'step_archive/step025_planning_chunk1.md'), "A year filter is provided above the chart.`n", $utf8Encoding)

$reviewInput = @{
    schema_version = 1
    topic_excerpt = 'The page must provide a year filter.'
    planning = @(@{
        path = 'step_archive/step025_planning_chunk1.md'
        excerpt = 'A year filter is provided above the chart.'
    })
    requirements = @(@{
        id = 'year-filter'
        text = 'The page must provide a year filter.'
    })
}
$inputPath = Join-Path $workspaceRoot 'jev-review-input.json'
[System.IO.File]::WriteAllText($inputPath, ($reviewInput | ConvertTo-Json -Depth 6), $utf8Encoding)

$OutputEncoding = $utf8Encoding
Get-Content -LiteralPath $inputPath -Raw -Encoding UTF8 |
    node scripts/jev-review.mjs prepare --workspace "$workspaceRoot" --input -
```

`prepare`는 원본과 발췌문을 대조하고 텍스트를 포함하지 않는 요약을 반환합니다. 준비 성공은 문서 내용의 합격 판정이 아닙니다.

Windows PowerShell에서는 파일을 UTF-8로 읽는 것과 네이티브 명령의 stdin에 UTF-8로 전달하는 것이 별개입니다. 한글 입력을 보존하려면 위 예제처럼 **`Get-Content -Encoding UTF8`와 `$OutputEncoding` 설정을 함께** 적용합니다. 입력은 `--input -`로 stdin에서만 받습니다.

## 명시적으로 선택한 경우 실행하기

TypeSafe의 기존 비밀 관리·환경 설정을 통해 **`TYPESAFE_API_KEY`**를 현재 Node 프로세스가 상속할 수 있어야 합니다. Windows 사용자 환경변수로 설정했다면 새 터미널에서 실행합니다. 키 값을 명령 인자, 입력 JSON, 소스 파일, 보고서 또는 로그에 넣거나 출력하지 않습니다.

사용자가 선택한 발췌문의 TypeSafe 외부 전송을 명시적으로 선택한 경우에만 다음 명령을 실행합니다. 이는 유료 API 호출이며 공식 요금은 [모델 문서](https://docs.typesafe.ai/models)에서 확인할 수 있습니다.

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content -LiteralPath $inputPath -Raw -Encoding UTF8 |
    node scripts/jev-review.mjs run --workspace "$workspaceRoot" --input - --allow-network
```

고정 주소 `https://api.typesafe.ai/v1/systemone`와 모델 `jev-1.13.0`으로 한 번 요청합니다. 자동 재시도나 리다이렉트 추적은 하지 않으며 요청 시간과 응답 크기를 제한합니다. `TYPESAFE_BASE_URL`이나 SDK 설정으로 주소·모델을 바꾸는 기능은 이 CLI에 없습니다.

`run`의 보고서는 `step_archive/outputs/jev-reviews/<sha256>.json`에 저장됩니다. 요약 결과의 `report_path`에서 보고서의 상대경로를 확인해 다음 검사에 사용합니다. 보고서는 선택 입력·요청·원본 파일의 해시, 모델·정책, 생성 시각, 기준 ID와 범주형 결과를 보존합니다. 원본 발췌문, 키, 서비스 오류 본문이나 자유형 설명을 보존하지 않습니다.

## 보고서와 원본의 현재 상태 확인

아래 보고서 경로를 `run`이 반환한 `report_path` 값으로 바꿉니다. `inspect`는 API 호출 없이 보고서의 구조와 원본 해시를 확인합니다. 반환값의 `status`는 현재 출처 상태이며 `review_status`는 저장된 검토가 `reviewed`인지 `unverified`인지 나타냅니다.

```powershell
node scripts/jev-review.mjs inspect --workspace "$workspaceRoot" --report 'step_archive/outputs/jev-reviews/<sha256>.json'
```

| 상태 | 해석과 다음 행동 |
|---|---|
| `prepared` | 입력과 원본 대조 완료. 아직 의미 평가는 실행하지 않음 |
| `reviewed` | 모델 응답을 검증해 보조 보고서를 생성함. 개별 판정은 검증자가 검토 |
| `unverified` | 인증·요청 제한·timeout·통신 오류·응답 오류·호출 중 입력 변경 등으로 유효한 검토를 확보하지 못함 |
| `current` | 보고서와 현재 원본의 출처 대조가 유효함. `review_status: unverified`이면 검토는 여전히 미검증이며 종료 코드 2 |
| `stale` | 원본이 바뀌어 현재 기획의 검토 증거로 사용할 수 없음 |
| `invalid` | 입력·보고서의 구조나 경로 등이 유효하지 않음 |

종료 코드 **0**은 `prepared`, `reviewed`, 또는 `current`이면서 `review_status: reviewed`인 경우입니다. 이는 제품 Acceptance나 의미적 정답을 뜻하지 않습니다. 코드 **2**는 invalid·unverified·stale와 `current`이면서 `review_status: unverified`인 경우를 포함합니다. 오류는 정제된 코드로 보고하며 원격 오류 본문을 출력하지 않습니다. 실패를 `met` 또는 PASS로 바꾸지 않습니다. 새 호출이 필요하다면 선택 범위와 사용자의 전송 선택을 유지하는지 먼저 확인합니다.

공식 계약: [HTTP API](https://docs.typesafe.ai/api), [confidence 해석](https://docs.typesafe.ai/confidence), [Jev 1.13의 한계](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
