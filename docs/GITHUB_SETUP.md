# GitHub 저장소 생성 준비

기준일: 2026-11-05. 이 문서는 원격 저장소와 향후 배포를 위한 설정을 정리한다. 연결 계정과 저장소 주소는 확인했으며 GitHub Actions 기반 Pages 배포가 활성화되어 있다.

## 1. 권장 설정

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

계정과 저장소 이름은 GitHub 연결 계정과 생성 화면에서 확인한다. 같은 이름의 저장소가 이미 있으면 기존 내용을 확인하고 연결 대상을 결정한다. 기존 저장소를 임의로 덮어쓰지 않는다.

## 2. 공개 파일 범위

포함: 소스, 재현 가능한 빌드 설정과 잠금 파일, PWA 리소스, 문서, 라이선스, 합성 예제와 합성 테스트.

제외: 실제 CSV·TSV, 개인 백업 JSON, 사용자 프롬프트·기록·사전 DB, 로컬 가져오기·내보내기 파일, 인증 정보, 의존성 폴더, 빌드/시험 산출물과 캐시.

`.gitignore`는 CSV·TSV를 기본 제외하고 `samples/tags.example.csv`만 허용한다. 실제 사전은 기존 위치에 그대로 보관하며 Git 준비 작업을 이유로 이동·삭제하지 않는다. Git에서 무시된 파일도 디렉터리 전체를 복사하는 배포 도구에는 포함될 수 있으므로 배포 산출물 목록도 별도로 확인한다.

JSON은 설정 파일과 잠금 파일에도 사용되므로 모든 JSON을 일괄 제외하지 않는다. 앱 백업의 지정 파일명과 개인 데이터 디렉터리를 제외한다.

## 3. 첫 커밋 전 확인

1. 현재 폴더가 의도한 프로젝트 루트인지 확인한다.
2. 개인 CSV가 `git check-ignore`의 대상이고 추적 파일 목록에 없는지 확인한다.
3. 준비한 문서·설정·합성 예제를 명시적으로 추가한다.
4. `git diff --cached --name-only`와 `git diff --cached --stat`로 실제 포함 파일을 확인한다.
5. 내용 검토 후 첫 커밋을 만든다. 커밋 작성자 정보는 해당 GitHub 계정에 맞춰 설정한다.

초기 공개 파일 목록은 다음과 같다. 구현 이후에는 필요한 소스·설정·테스트를 추가한다.

```text
.gitattributes
.gitignore
AGENTS.md
LICENSE
README.md
THIRD_PARTY_NOTICES.md
docs/CSV_FORMAT.md
docs/GITHUB_SETUP.md
docs/IMPLEMENTATION_PLAN.md
docs/SPECIFICATION.md
docs/TESTING.md
samples/tags.example.csv
```

## 4. 원격 생성과 연결

2026-11-05 사용자가 Public 원격 저장소 생성과 첫 커밋 게시를 요청했다. 대상은 `Cr0ssEyE/generation-tag-autocomplete`, 기본 브랜치는 `main`이다. 앱 구현과 Pages 배포는 후속 단계다.

GitHub 연결 도구에 저장소 생성 기능이 없으면 GitHub 웹에서 빈 Public 저장소를 생성한 뒤 로컬 Git의 첫 커밋을 연결할 수 있다. 서버에서 README·.gitignore·라이선스를 자동 생성하지 않아 로컬 준비 파일과 별도의 초기 커밋이 생기지 않게 한다.

GitHub CLI를 사용하는 경우 아래 명령 형태를 대안으로 사용할 수 있다. CLI 설치와 로그인은 별도 환경 준비다.

```text
gh repo create Cr0ssEyE/generation-tag-autocomplete --public --source . --remote origin --description "이미지 생성 프롬프트 작성 보조 툴"
git push -u origin main
```

인증 값은 소스·문서·명령 인수에 저장하지 않는다. 기존 `origin`이 있으면 대상을 먼저 확인한다. 원격 생성 결과가 불분명하면 같은 작업을 반복하기 전에 저장소 존재 여부를 확인한다.

## 5. Pages 배포 단계

실제 앱 빌드가 준비된 뒤 GitHub Actions 기반 Pages 워크플로를 추가한다. 프로젝트 하위 경로에 맞는 base URL, manifest start URL/scope와 Service Worker 범위를 함께 설정한다.

저장소 루트 전체 대신 검증한 앱 빌드 출력만 배포한다. 소스 폴더의 개인 사전은 빌드 과정에서 자동 탐색·복사하지 않는다. 외부 런타임 스크립트나 사용자 데이터용 API도 추가하지 않는다.

현재 문서만 있는 단계에는 실행 불가능한 앱 CI나 배포 워크플로를 추가하지 않는다. 원격 저장소 Public 결정은 개인 사전 공개를 의미하지 않는다.

## 6. 참고 문서

- [GitHub Pages 개요](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages 사용자 지정 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub CLI repo create](https://cli.github.com/manual/gh_repo_create)
- [EreNodes MIT 라이선스](https://github.com/Erehr/ComfyUI-EreNodes/blob/main/LICENSE)
