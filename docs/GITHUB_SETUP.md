# GitHub 저장소와 배포

기준일: 2026-11-06. Public 원격 저장소와 GitHub Actions 기반 Pages 배포를 운영 중이다.

## 1. 현재 설정

| 항목 | 값 |
| --- | --- |
| 앱 이름 | Generation Tag AutoComplete |
| 설명 | 이미지 생성 프롬프트 작성 보조 툴 |
| 저장소 이름 | `generation-tag-autocomplete` |
| 소유 계정 | `Cr0ssEyE` |
| 원격 저장소 | `https://github.com/Cr0ssEyE/generation-tag-autocomplete` |
| 공개 범위 | Public |
| 기본 브랜치 | `main` |
| 라이선스 | MIT |
| 배포 | GitHub Pages, 프로젝트 사이트 |
| Pages 주소 | `https://cr0sseye.github.io/generation-tag-autocomplete/` |
| Pages 소스 | GitHub Actions |

원격 저장소 생성·첫 커밋 게시·앱 배포는 완료했다. 인증 값은 소스·문서·명령 인수에 저장하지 않는다. 기존 원격 이력을 덮어쓰지 않는다.

## 2. 공개 파일 범위

포함: 소스, 재현 가능한 빌드 설정과 잠금 파일, PWA 리소스, 문서, 라이선스, 합성 예제와 합성 테스트.

제외: 실제 CSV·TSV, 개인 백업 JSON, 사용자 프롬프트·기록·사전 DB, 로컬 가져오기·내보내기 파일, 인증 정보, 의존성 폴더, 빌드/시험 산출물과 캐시.

`.gitignore`는 CSV·TSV를 기본 제외하고 `samples/tags.example.csv`만 허용한다. 실제 사전은 기존 위치에 그대로 보관하며 Git 준비 작업을 이유로 이동·삭제하지 않는다. Git에서 무시된 파일도 디렉터리 전체를 복사하는 배포 도구에는 포함될 수 있으므로 배포 산출물 목록도 별도로 확인한다.

JSON은 설정 파일과 잠금 파일에도 사용되므로 모든 JSON을 일괄 제외하지 않는다. 앱 백업의 지정 파일명과 개인 데이터 디렉터리를 제외한다.

## 3. 변경 게시 전 확인

1. 현재 폴더가 의도한 프로젝트 루트인지, `origin`이 위 저장소인지 확인한다.
2. 개인 CSV가 `git check-ignore`의 대상이고 추적 파일 목록에 없는지 확인한다.
3. 게시할 소스·문서·설정을 파일명으로 명시해 추가한다.
4. `git diff --cached --name-only`, `git diff --cached --stat`, `git diff --cached --check`와 실제 내용을 검토한다.
5. 구현 변경은 `pnpm test`·`pnpm build`를 통과하고 배포 산출물 목록도 검토한 뒤 커밋·푸시한다.

현재 공개 파일은 다음 범위로 관리한다. 실제 포함 여부는 매 게시 시 Git 목록에서 확인한다.

```text
.gitattributes
.gitignore
AGENTS.md
CHANGELOG.md
LICENSE
README.md
THIRD_PARTY_NOTICES.md
docs/
samples/tags.example.csv
.github/workflows/pages.yml
src/
public/
scripts/
tests/
package.json
pnpm-lock.yaml
index.html
tsconfig.json
vite.config.ts
```

## 4. 현재 배포 흐름

`.github/workflows/pages.yml`은 `main` 푸시와 수동 실행에서 테스트·빌드·Pages 배포를 수행한다. Pull Request에서는 테스트·빌드만 수행한다.

1. Node.js 24와 pnpm 11.25.0을 준비한다.
2. `pnpm install --frozen-lockfile --ignore-scripts`로 잠금 파일의 의존성을 설치한다.
3. `pnpm test`와 `pnpm build`를 실행한다.
4. `dist`만 Pages 산출물로 업로드하고 배포한다.

## 5. 배포 범위와 확인

상대 경로 기반 빌드와 앱 경로의 manifest·Service Worker 범위를 사용한다. 배포 파일은 앱 HTML·JS·CSS, manifest·아이콘·Service Worker와 필요한 라이선스 고지로 제한한다.

저장소 루트 전체 대신 검증한 앱 빌드 출력만 배포한다. 소스 폴더의 개인 사전은 빌드 과정에서 자동 탐색·복사하지 않는다. 외부 런타임 스크립트나 사용자 데이터용 API도 추가하지 않는다.

배포 뒤 Actions 결과와 앱 로딩을 확인한다. 기존 설치 사용자는 앱의 업데이트 안내를 통해 새 리소스를 적용한다. 검증 범위와 추가 진단 항목은 [TESTING.md](TESTING.md), 버전별 변경은 [CHANGELOG.md](../CHANGELOG.md)를 참조한다. 문서만 바뀐 커밋도 현재 워크플로를 실행하지만, 캐시 대상 앱 파일이 같으면 새 Service Worker 버전은 생성되지 않는다.

## 6. 참고 문서

- [GitHub Pages 개요](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages 사용자 지정 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub CLI repo create](https://cli.github.com/manual/gh_repo_create)
- [EreNodes MIT 라이선스](https://github.com/Erehr/ComfyUI-EreNodes/blob/main/LICENSE)
