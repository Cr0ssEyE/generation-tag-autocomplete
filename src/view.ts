export const view = `
<nav class="main-nav" aria-label="주 메뉴">
  <div class="nav-inner">
    <button data-page="editor" aria-current="page">편집</button>
    <button data-page="dictionary">사전 관리</button>
    <button data-page="library">라이브러리</button>
    <button data-page="settings">설정 &amp; 백업</button>
  </div>
</nav>
<main class="shell">
  <header class="app-header">
    <div><h1>Generation Tag AutoComplete</h1><p>이미지 생성 프롬프트 작성 보조 툴</p></div>
    <div id="save-status" class="save-indicator" role="status">저장소 준비 중…</div>
  </header>
  <div id="notice" role="status" class="notice" hidden></div>
  <div id="update-bar" class="update-bar" hidden>새 버전이 준비되었습니다. <button id="apply-update">저장 후 업데이트</button></div>

  <section id="page-editor" class="page workspace">
    <section class="panel editor-panel">
      <div class="panel-heading"><h2>프롬프트 편집</h2><button id="save-prompt" class="text-button">이름을 붙여 저장</button></div>
      <div class="prompt-tabs" role="tablist" aria-label="편집할 프롬프트">
        <button id="target-positive" data-target="positive" role="tab" aria-controls="block-positive" aria-selected="true">긍정</button>
        <button id="target-negative" data-target="negative" role="tab" aria-controls="block-negative" aria-selected="false" tabindex="-1">부정</button>
      </div>
      <div class="editor-block" id="block-positive" role="tabpanel" aria-labelledby="target-positive">
        <div class="editor-heading"><label for="positive">긍정 프롬프트</label><div class="actions"><button data-undo="positive" disabled>삽입 취소</button><button data-copy="positive">복사</button></div></div>
        <textarea id="positive" aria-label="긍정 프롬프트" aria-describedby="completion-help" placeholder="태그 또는 한글 설명 입력" spellcheck="false" autocapitalize="off"></textarea>
        <div class="editor-foot"><span>쉼표 · 줄바꿈으로 항목 구분</span><span id="positive-count">0자</span></div>
      </div>
      <div class="editor-block" id="block-negative" role="tabpanel" aria-labelledby="target-negative" hidden>
        <div class="editor-heading"><label for="negative">부정 프롬프트</label><div class="actions"><button data-undo="negative" disabled>삽입 취소</button><button data-copy="negative">복사</button></div></div>
        <textarea id="negative" aria-label="부정 프롬프트" aria-describedby="completion-help" placeholder="제외할 태그 또는 한글 설명 입력" spellcheck="false" autocapitalize="off"></textarea>
        <div class="editor-foot"><span>쉼표 · 줄바꿈으로 항목 구분</span><span id="negative-count">0자</span></div>
      </div>
      <section class="completion-panel" aria-label="입력 중 자동완성">
        <div class="completion-heading"><h3>자동완성</h3><span id="completion-meta" class="muted small">현재 항목의 태그 후보</span></div>
        <p id="completion-status" class="completion-status" role="status"></p>
        <div id="completion-results" class="completion-results" aria-live="polite" aria-busy="false"></div>
        <p id="completion-help" class="completion-help">후보를 선택하면 커서가 있는 항목만 바뀝니다.</p>
      </section>
    </section>

    <button id="finder-toggle" class="finder-toggle" aria-controls="finder-panel" aria-expanded="false" aria-label="태그 찾기 열기">태그<br>찾기</button>
    <div id="finder-scrim" class="finder-scrim" hidden></div>
    <aside id="finder-panel" class="panel finder" aria-labelledby="finder-title" hidden>
      <div class="finder-title"><h2 id="finder-title">태그 찾기</h2><button id="finder-close" aria-label="태그 찾기 닫기">닫기</button></div>
      <div id="finder-body" class="finder-body">
        <div class="finder-controls">
        <div class="finder-heading"><span id="dictionary-label" class="muted small">사전 없음</span><span class="small">삽입 대상: <strong id="target-label">긍정</strong></span></div>
        <div class="toggle" role="tablist" aria-label="태그 목록">
          <button id="bookmark-tab" role="tab" aria-selected="true">북마크</button>
          <button id="search-tab" role="tab" aria-selected="false" tabindex="-1">유형 탐색</button>
          <button id="history-tab" role="tab" aria-selected="false" tabindex="-1">기록 <span id="history-count">0</span></button>
        </div>
        <div id="search-controls" hidden>
          <label class="search-box"><input id="query" type="search" placeholder="태그 또는 설명으로 좁히기" aria-label="태그 검색" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
          <div class="filter-line"><select id="type-filter" aria-label="유형 필터"><option value="">모든 유형</option></select><span id="search-meta" class="muted small">유형을 선택하거나 검색어 입력</span></div>
        </div>
        <div id="history-controls" class="filter-line" hidden><span class="muted small">최근 사용순 · 최대 1,000개</span><button id="clear-history" class="text-button">기록 비우기</button></div>
        </div>
        <div id="results" class="results" aria-live="polite"></div>
      </div>
    </aside>
  </section>

  <section id="page-dictionary" class="page" hidden>
    <div class="section-title"><h2>태그 사전</h2><p>CSV를 이 브라우저에 보관하고, 검색할 사전 하나를 선택합니다.</p></div>
    <div class="panel import-panel">
      <h3>CSV 가져오기</h3><p>UTF-8 · 태그 / 유형코드 / 카운트 / 설명의 4열 형식</p>
      <div class="actions"><label class="button primary">파일 선택<input id="csv-file" type="file" accept=".csv,text/csv" hidden></label><button id="load-sample">공개 예제 가져오기</button><button id="cancel-import" hidden>가져오기 취소</button></div>
      <p id="import-status" role="status" class="muted">CSV는 서버로 전송하지 않습니다.</p>
      <details id="import-details" hidden><summary>가져오기 결과</summary><pre id="import-report"></pre></details>
    </div>
    <div id="dictionary-list" class="card-list"></div>
  </section>

  <section id="page-library" class="page" hidden>
    <div class="section-title"><h2>라이브러리</h2><p>사전 교체·삭제와 별도로 보관됩니다.</p></div>
    <div class="library-grid">
      <section class="panel"><div class="panel-heading"><h3>저장한 프롬프트</h3><button id="library-save" class="text-button">현재 초안 저장</button></div><div id="prompt-list"></div></section>
      <section class="panel"><div class="panel-heading"><h3>태그 북마크</h3></div><div id="favorite-list"></div></section>
      <section class="panel"><div class="panel-heading"><h3>태그 묶음</h3><button id="new-group" class="text-button">묶음 만들기</button></div><p class="muted small">현재 프롬프트의 쉼표·줄바꿈 항목으로 만듭니다.</p><div id="group-list"></div></section>
    </div>
  </section>

  <section id="page-settings" class="page" hidden>
    <div class="section-title"><h2>설정 &amp; 백업</h2></div>
    <div class="library-grid">
      <section class="panel settings-panel"><h3>JSON 백업</h3><p>초안, 저장 프롬프트, 북마크, 묶음, 기록과 설정을 내보냅니다. CSV 본문은 포함하지 않습니다.</p>
        <div class="actions"><button id="export-backup" class="primary">백업 내보내기</button><label class="button">백업 파일 선택<input id="backup-file" type="file" accept=".json,application/json" hidden></label></div>
        <div id="restore-preview" hidden><p id="restore-summary"></p><button id="confirm-restore" class="danger">현재 개인 데이터를 전체 교체</button><button id="cancel-restore">취소</button></div>
      </section>
      <section class="panel settings-panel"><h3>저장 공간</h3><p id="storage-info">확인 중…</p><button id="persist-storage">지속 저장 요청</button><p class="small muted">허용 여부는 브라우저가 결정합니다. 사이트 데이터를 삭제하기 전에 JSON 백업을 보관하세요.</p></section>
      <section class="panel settings-panel"><h3>홈 화면 · 오프라인</h3><p id="offline-status">앱 리소스 준비 중…</p><button id="install-app" hidden>홈 화면에 설치</button><p class="small muted">설치 버튼이 없으면 Chrome 메뉴의 ‘홈 화면에 추가’를 사용하세요.</p><a href="./LICENSE" target="_blank" rel="noopener">MIT 라이선스</a> · <a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">외부 저작물 고지</a></section>
    </div>
  </section>
  <footer class="footer">Generation Tag AutoComplete · 0.3.0</footer>
</main>
<dialog id="name-dialog"><form method="dialog"><h2 id="dialog-title">이름을 붙여 저장</h2><label>이름<input id="item-name" maxlength="100" required autocomplete="off"></label><div class="actions"><button value="cancel" formnovalidate>취소</button><button value="save" class="primary">저장</button></div></form></dialog>
<dialog id="prompt-preview" class="prompt-preview" aria-labelledby="prompt-preview-title">
  <div class="preview-header"><h2 id="prompt-preview-title">저장한 프롬프트</h2><button id="preview-close" aria-label="미리보기 닫기">닫기</button></div>
  <div class="preview-body">
    <p class="preview-warning">불러오면 현재 긍정·부정 초안을 모두 교체합니다.</p>
    <section class="preview-section"><div class="preview-heading"><label for="preview-positive">긍정 프롬프트</label><button data-preview-copy="positive">긍정 복사</button></div><textarea id="preview-positive" readonly spellcheck="false"></textarea><p id="preview-positive-empty" class="muted small" hidden>내용 없음 — 불러오면 현재 초안이 비워집니다</p></section>
    <section class="preview-section"><div class="preview-heading"><label for="preview-negative">부정 프롬프트</label><button data-preview-copy="negative">부정 복사</button></div><textarea id="preview-negative" readonly spellcheck="false"></textarea><p id="preview-negative-empty" class="muted small" hidden>내용 없음 — 불러오면 현재 초안이 비워집니다</p></section>
    <p id="preview-status" role="status"></p>
  </div>
  <div class="preview-footer"><button id="preview-cancel" autofocus>취소</button><button id="preview-load" class="primary">양쪽 초안 교체</button></div>
</dialog>`;
