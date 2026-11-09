/* global window, document, XMLHttpRequest */
(function () {
  "use strict";

  var PAGE_SIZE = 10;
  var GOOGLE_SHEET_ID = "1bLgsEAx6s_V7bJJY8cJMTvS2bHQbZue1jAO-e9fJgyU";
  var CSV_URL_BY_SITE = {
    3: "https://docs.google.com/spreadsheets/d/" + GOOGLE_SHEET_ID + "/gviz/tq?tqx=out:csv&gid=1180448183",
    4: "https://docs.google.com/spreadsheets/d/" + GOOGLE_SHEET_ID + "/gviz/tq?tqx=out:csv&gid=1285026582"
  };
  var LOAN_DAYS_BY_SITE = { 3: 7, 4: 14 };
  var FIELD_LABELS = { "서명": "도서명", "저자": "저자", "출판사": "출판사" };
  var cache = { 3: null, 4: null };
  var state = { site: "4", field: "서명", query: "", submittedQuery: "", currentPage: 1, filtered: [], loading: false };

  var queryInput = document.getElementById("queryInput");
  var searchBtn = document.getElementById("searchBtn");
  var errorBox = document.getElementById("errorBox");
  var loadErrorBox = document.getElementById("loadErrorBox");
  var countValue = document.getElementById("countValue");
  var dueDateValue = document.getElementById("dueDateValue");
  var resultCount = document.getElementById("resultCount");
  var resultMeta = document.getElementById("resultMeta");
  var tbody = document.getElementById("tbody");
  var pager = document.getElementById("pager");
  var siteButtons = document.querySelectorAll("[data-site]");
  var fieldButtons = document.querySelectorAll("[data-field]");

  function trim(value) { return (value == null ? "" : String(value)).replace(/^\s+|\s+$/g, ""); }
  function normalize(value) { return trim(value).toLowerCase().replace(/\s+/g, " "); }
  function normalizeNoSpace(value) { return normalize(value).replace(/\s+/g, ""); }
  function addDays(date, days) { var next = new Date(date.getTime()); next.setDate(next.getDate() + days); return next; }
  function formatDate(date) { return (date.getMonth() + 1) + "월 " + date.getDate() + "일"; }
  function show(el) { el.style.display = ""; }
  function hide(el) { el.style.display = "none"; }
  function setMessage(el, message) { el.innerHTML = escapeHtml(message || ""); message ? show(el) : hide(el); }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function parseCSV(text) {
    if (text && text.charCodeAt(0) === 65279) text = text.slice(1);
    var rows = [], row = [], field = "", quoted = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      if (quoted) {
        if (ch === '"' && text.charAt(i + 1) === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch !== "\r") field += ch;
    }
    row.push(field); rows.push(row);
    return rows;
  }

  function mapRows(rows) {
    if (!rows.length) return [];
    var headers = rows[0], books = [], r, c, item, line, cls, authorKey;
    for (r = 1; r < rows.length; r++) {
      line = rows[r]; item = {};
      for (c = 0; c < headers.length; c++) item[headers[c]] = line[c] || "";
      if (!trim(item["서명"]) && !trim(item["저자"]) && !trim(item["출판사"])) continue;
      cls = trim(item["분류기호"]); authorKey = trim(item["저자기호"]);
      books.push({ id: "r" + r, "서명": trim(item["서명"]), "저자": trim(item["저자"]), "출판사": trim(item["출판사"]), "청구기호": trim(cls + (cls && authorKey ? " " : "") + authorKey) });
    }
    return books;
  }

  function setLoading(loading) {
    var i;
    state.loading = loading;
    searchBtn.disabled = loading;
    queryInput.disabled = loading;
    for (i = 0; i < siteButtons.length; i++) siteButtons[i].disabled = loading;
    for (i = 0; i < fieldButtons.length; i++) fieldButtons[i].disabled = loading;
    if (loading) countValue.innerHTML = "불러오는 중";
  }

  function loadSite(site, done) {
    if (cache[site]) { done(null, cache[site]); return; }
    var xhr = new XMLHttpRequest();
    xhr.open("GET", CSV_URL_BY_SITE[site] + "&cacheBust=" + new Date().getTime(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        cache[site] = mapRows(parseCSV(xhr.responseText));
        done(null, cache[site]);
      } else done(new Error("Google Sheets 장서 목록을 불러오지 못했습니다. (HTTP " + xhr.status + ")"));
    };
    xhr.send(null);
  }

  function updateButtons(buttons, attribute, value) {
    var i;
    for (i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute(attribute) === value) buttons[i].className = "segmentButton active";
      else buttons[i].className = "segmentButton";
    }
  }

  function renderStats() {
    if (!state.loading) countValue.innerHTML = cache[state.site] ? cache[state.site].length.toLocaleString() + "권" : "0권";
    dueDateValue.innerHTML = formatDate(addDays(new Date(), LOAN_DAYS_BY_SITE[state.site] || 14));
  }

  function filterBooks() {
    var q = normalize(state.submittedQuery), qNoSpace = normalizeNoSpace(state.submittedQuery);
    var source = cache[state.site] || [], result = [], i, target;
    if (!q) return result;
    for (i = 0; i < source.length; i++) {
      target = source[i][state.field] || "";
      if (normalize(target).indexOf(q) !== -1 || normalizeNoSpace(target).indexOf(qNoSpace) !== -1) result.push(source[i]);
    }
    return result;
  }

  function renderPager(totalPages) {
    if (totalPages <= 1) { hide(pager); return; }
    var first = Math.max(1, Math.min(state.currentPage - 2, totalPages - 4));
    var last = Math.min(totalPages, first + 4), html = "", page;
    html += '<button class="pagerBtn" data-page="prev"' + (state.currentPage === 1 ? " disabled" : "") + ">‹</button>";
    for (page = first; page <= last; page++) html += '<button class="pagerBtn' + (page === state.currentPage ? " active" : "") + '" data-page="' + page + '">' + page + "</button>";
    html += '<button class="pagerBtn" data-page="next"' + (state.currentPage === totalPages ? " disabled" : "") + ">›</button>";
    pager.innerHTML = html; show(pager);
    var buttons = pager.getElementsByTagName("button"), i;
    for (i = 0; i < buttons.length; i++) buttons[i].onclick = function () {
      var pageValue = this.getAttribute("data-page");
      if (pageValue === "prev") state.currentPage--;
      else if (pageValue === "next") state.currentPage++;
      else state.currentPage = parseInt(pageValue, 10);
      renderResults();
    };
  }

  function renderResults() {
    var total = state.filtered.length, totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var start, end, html = "", i, book;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    resultCount.innerHTML = "검색 결과 " + total.toLocaleString() + "권";
    resultMeta.innerHTML = state.site + "단지 · 검색어: " + escapeHtml(state.submittedQuery || "전체") + " · 검색 대상: " + FIELD_LABELS[state.field];
    if (!state.submittedQuery) {
      tbody.innerHTML = '<tr><td class="empty" colspan="4">도서관을 선택하고 검색해 주세요.</td></tr>';
      hide(pager); return;
    }
    if (!total) {
      tbody.innerHTML = '<tr><td class="empty" colspan="4">검색 결과가 없습니다.</td></tr>';
      hide(pager); return;
    }
    start = (state.currentPage - 1) * PAGE_SIZE; end = Math.min(start + PAGE_SIZE, total);
    for (i = start; i < end; i++) {
      book = state.filtered[i];
      html += "<tr><td>" + escapeHtml(book["서명"]) + '</td><td class="col-author">' + escapeHtml(book["저자"]) + '</td><td class="col-pub">' + escapeHtml(book["출판사"]) + "</td><td>" + escapeHtml(book["청구기호"]) + "</td></tr>";
    }
    tbody.innerHTML = html; renderPager(totalPages);
  }

  function preload(site) {
    setLoading(true); setMessage(loadErrorBox, "");
    loadSite(site, function (error) {
      setLoading(false);
      if (error) setMessage(loadErrorBox, "로딩 오류: " + error.message);
      renderStats(); renderResults();
    });
  }

  function runSearch() {
    state.query = trim(queryInput.value);
    if (!state.query) { setMessage(errorBox, "검색어를 입력해주세요."); state.submittedQuery = ""; state.filtered = []; state.currentPage = 1; renderResults(); return; }
    setMessage(errorBox, ""); setMessage(loadErrorBox, ""); setLoading(true);
    loadSite(state.site, function (error) {
      setLoading(false);
      if (error) { setMessage(loadErrorBox, "로딩 오류: " + error.message); return; }
      state.submittedQuery = state.query; state.currentPage = 1; state.filtered = filterBooks();
      renderStats(); renderResults();
    });
  }

  var i;
  for (i = 0; i < siteButtons.length; i++) siteButtons[i].onclick = function () {
    state.site = this.getAttribute("data-site"); state.submittedQuery = ""; state.filtered = []; state.currentPage = 1;
    updateButtons(siteButtons, "data-site", state.site); renderStats(); renderResults(); preload(state.site);
  };
  for (i = 0; i < fieldButtons.length; i++) fieldButtons[i].onclick = function () {
    state.field = this.getAttribute("data-field"); state.currentPage = 1;
    updateButtons(fieldButtons, "data-field", state.field);
    if (state.submittedQuery) state.filtered = filterBooks();
    renderResults();
  };
  searchBtn.onclick = runSearch;
  queryInput.onkeyup = function (event) { event = event || window.event; if (event.keyCode === 13) runSearch(); };

  renderStats(); renderResults(); preload("4");
})();
