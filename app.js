/* global window, document */

(function () {
  var PAGE_SIZE = 10;

  var CSV_BY_SITE = {
    3: "./books_3.csv",
    4: "./books_4.csv",
  };

  var LOAN_DAYS_BY_SITE = {
    3: 7,
    4: 14,
  };

  var cache = { 3: null, 4: null };

  var siteSelect = document.getElementById("siteSelect");
  var fieldSelect = document.getElementById("fieldSelect");
  var queryInput = document.getElementById("queryInput");
  var searchBtn = document.getElementById("searchBtn");

  var titleEl = document.getElementById("title");
  var countInfo = document.getElementById("countInfo");
  var resultInfo = document.getElementById("resultInfo");

  var errorBox = document.getElementById("errorBox");
  var loadErrorBox = document.getElementById("loadErrorBox");

  var tbody = document.getElementById("tbody");
  var pager = document.getElementById("pager");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var pageInfo = document.getElementById("pageInfo");

  var loanInfo = document.getElementById("loanInfo");
  var tipWrap = document.getElementById("tipWrap");
  var tipIcon = document.getElementById("tipIcon");
  var tipBox = document.getElementById("tipBox");

  var state = {
    site: "",
    field: "서명",
    query: "",
    submittedQuery: "",
    currentPage: 1,
    filtered: [],
  };

  function show(el) {
    el.style.display = "";
  }
  function hide(el) {
    el.style.display = "none";
  }

  function setError(msg) {
    if (msg) {
      errorBox.innerHTML = msg;
      show(errorBox);
    } else {
      errorBox.innerHTML = "";
      hide(errorBox);
    }
  }

  function setLoadError(msg) {
    if (msg) {
      loadErrorBox.innerHTML = msg;
      show(loadErrorBox);
    } else {
      loadErrorBox.innerHTML = "";
      hide(loadErrorBox);
    }
  }

  function trim(s) {
    return (s || "").replace(/^\s+|\s+$/g, "");
  }

  function normalizeBase(s) {
    s = s == null ? "" : String(s);
    s = trim(s).toLowerCase();
    // 연속 공백 하나로
    s = s.replace(/\s+/g, " ");
    return s;
  }

  function normalizeNoSpace(s) {
    return normalizeBase(s).replace(/\s+/g, "");
  }

  function pad2(n) {
    n = String(n);
    return n.length === 1 ? "0" + n : n;
  }

  // Intl 없는 구형 대비: YYYY.MM.DD(요일은 생략)
  function formatDate(d) {
    return (
      d.getFullYear() + "." + pad2(d.getMonth() + 1) + "." + pad2(d.getDate())
    );
  }

  function addDays(date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  // 아주 단순 CSV 파서: 큰따옴표 포함 케이스도 어느 정도 처리
  function parseCSV(text) {
    // BOM 제거
    if (text && text.charCodeAt(0) === 65279) {
      text = text.slice(1);
    }

    var rows = [];
    var i, ch;
    var row = [];
    var field = "";
    var inQuotes = false;

    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);

      if (inQuotes) {
        if (ch === '"') {
          // "" -> "
          if (i + 1 < text.length && text.charAt(i + 1) === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(field);
          field = "";
        } else if (ch === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else if (ch === "\r") {
          // ignore
        } else {
          field += ch;
        }
      }
    }

    // 마지막 필드/행
    row.push(field);
    rows.push(row);

    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows || rows.length < 2) return [];
    var header = rows[0];
    var list = [];
    var r, i;
    for (r = 1; r < rows.length; r++) {
      var line = rows[r];
      // 빈 줄 skip (서명/저자/출판사 전부 비었으면)
      if (!line || line.length === 0) continue;

      var obj = { __id: "r" + r };
      for (i = 0; i < header.length; i++) {
        obj[header[i]] = i < line.length ? line[i] : "";
      }
      list.push(obj);
    }
    return list;
  }

  function xhrGet(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) cb(null, xhr.responseText);
        else cb(new Error("HTTP " + xhr.status));
      }
    };
    xhr.send(null);
  }

  function loadSiteIfNeeded(site, done) {
    if (!site) return done(new Error("site required"));
    if (cache[site]) return done(null, cache[site]);

    var url = CSV_BY_SITE[site];
    if (!url) return done(new Error("CSV 설정이 없습니다."));

    xhrGet(url, function (err, text) {
      if (err) return done(new Error("CSV 로드 실패: " + err.message));

      var rows = parseCSV(text);
      var objs = rowsToObjects(rows);

      // 필요한 값만 매핑 + 청구기호 합치기
      var mapped = [];
      var i;
      for (i = 0; i < objs.length; i++) {
        var o = objs[i];

        var title = trim(o["서명"] || "");
        var author = trim(o["저자"] || "");
        var pub = trim(o["출판사"] || "");

        var cls = trim(o["분류기호"] || "");
        var authKey = trim(o["저자기호"] || "");
        var callNo = trim(
          (cls ? cls : "") +
            (cls && authKey ? " " : "") +
            (authKey ? authKey : "")
        );

        mapped.push({
          id: o.__id,
          서명: title,
          저자: author,
          출판사: pub,
          청구기호: callNo,
        });
      }

      cache[site] = mapped;
      done(null, mapped);
    });
  }

  function renderHeader() {
    if (state.site) {
      titleEl.innerHTML = state.site + "단지 작은도서관 장서 검색";
      countInfo.innerHTML =
        "총 장서량: " +
        (cache[state.site] ? cache[state.site].length : 0) +
        "권";
    } else {
      titleEl.innerHTML = "작은도서관 장서 검색";
      countInfo.innerHTML = "도서관을 선택한 뒤 검색해 주세요.";
    }
  }

  function renderLoanInfo() {
    if (!state.site) {
      hide(loanInfo);
      hide(tipWrap);
      return;
    }

    var today = new Date();
    var days = LOAN_DAYS_BY_SITE[state.site] || 14;
    var due = addDays(today, days);

    loanInfo.innerHTML =
      "오늘(" +
      formatDate(today) +
      ") 대출 시 반납일: " +
      "<b>" +
      formatDate(due) +
      "</b>";
    show(loanInfo);
    show(tipWrap);
  }

  function filterBooks() {
    var q = normalizeBase(state.submittedQuery);
    if (!q) return [];

    var qNo = normalizeNoSpace(state.submittedQuery);
    var field = state.field;

    var list = cache[state.site] || [];
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      var target = b[field] || "";
      var t = normalizeBase(target);
      var tNo = normalizeNoSpace(target);

      if (t.indexOf(q) !== -1 || tNo.indexOf(qNo) !== -1) {
        out.push(b);
      }
    }
    return out;
  }

  function clearTable(msg) {
    tbody.innerHTML = '<tr><td class="empty" colspan="4">' + msg + "</td></tr>";
  }

  function renderTable() {
    var total = state.filtered.length;
    resultInfo.innerHTML = "검색 결과: <b>" + total + "</b>권";

    if (!state.submittedQuery) {
      clearTable("도서관을 선택하고 검색해 주세요.");
      hide(pager);
      return;
    }

    if (total === 0) {
      clearTable("검색 결과가 없습니다.");
      hide(pager);
      return;
    }

    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    var start = (state.currentPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);

    var html = "";
    var i;
    for (i = start; i < end; i++) {
      var b = state.filtered[i];
      html += "<tr>";
      html += "<td>" + escapeHtml(b["서명"]) + "</td>";
      html += '<td class="col-author">' + escapeHtml(b["저자"]) + "</td>";
      html += '<td class="col-pub">' + escapeHtml(b["출판사"]) + "</td>";
      html += "<td>" + escapeHtml(b["청구기호"]) + "</td>";
      html += "</tr>";
    }

    tbody.innerHTML = html;

    if (total > PAGE_SIZE) {
      pageInfo.innerHTML = state.currentPage + " / " + totalPages;
      prevBtn.disabled = state.currentPage === 1;
      nextBtn.disabled = state.currentPage === totalPages;
      show(pager);
    } else {
      hide(pager);
    }
  }

  function escapeHtml(s) {
    s = s == null ? "" : String(s);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function runSearch() {
    var site = state.site;
    var trimmedQ = trim(state.query);

    if (!site) {
      setError("3단지/4단지를 먼저 선택해 주세요.");
      state.submittedQuery = "";
      state.filtered = [];
      state.currentPage = 1;
      renderTable();
      return;
    }

    if (trimmedQ === "") {
      setError("검색어를 입력해주세요.");
      state.submittedQuery = "";
      state.filtered = [];
      state.currentPage = 1;
      renderTable();
      return;
    }

    setError("");
    setLoadError("");

    // CSV 로드 후 필터
    loadSiteIfNeeded(site, function (err) {
      if (err) {
        setLoadError(err.message);
        state.submittedQuery = "";
        state.filtered = [];
        state.currentPage = 1;
        renderHeader();
        renderLoanInfo();
        renderTable();
        return;
      }

      state.submittedQuery = trimmedQ;
      state.currentPage = 1;
      state.filtered = filterBooks();

      renderHeader();
      renderLoanInfo();
      renderTable();
    });
  }

  // 이벤트
  siteSelect.onchange = function () {
    state.site = siteSelect.value;
    state.submittedQuery = "";
    state.currentPage = 1;
    state.filtered = [];

    setError("");
    setLoadError("");

    renderHeader();
    renderLoanInfo();
    renderTable();

    // 선택 즉시 미리 로드(프리로드)
    if (state.site) {
      loadSiteIfNeeded(state.site, function (err) {
        if (err) setLoadError(err.message);
        renderHeader();
        renderLoanInfo();
      });
    }
  };

  fieldSelect.onchange = function () {
    state.field = fieldSelect.value;
    state.currentPage = 1;
    if (state.submittedQuery) {
      state.filtered = filterBooks();
      renderTable();
    }
  };

  queryInput.onkeyup = function (e) {
    state.query = queryInput.value;
    e = e || window.event;
    if (e.keyCode === 13) runSearch();
  };

  searchBtn.onclick = function () {
    state.query = queryInput.value;
    runSearch();
  };

  prevBtn.onclick = function () {
    state.currentPage -= 1;
    renderTable();
  };

  nextBtn.onclick = function () {
    state.currentPage += 1;
    renderTable();
  };

  // 모바일/구형에서 hover가 안 되므로, 아이콘 탭으로 토글
  tipIcon.onclick = function () {
    // display 토글
    if (tipBox.style.display === "block") tipBox.style.display = "none";
    else tipBox.style.display = "block";
  };

  // 초기 렌더
  renderHeader();
  renderLoanInfo();
  renderTable();
})();
