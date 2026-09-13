// =====================================================================
// 人事状态同步系统 V3.2  —— WPS JSA (JavaScript 宏)
// =====================================================================
// 设计原则：数据库 = 唯一主数据源；其余 7 张表均为派生视图（纯固定值）
// 核心功能：【同步员工状态】【全量校准】【数据检查】【同步日志】
//
// V3.2 相对 V3.1 的两大改动（业务规则完全不变）：
//
//   A. 派生表彻底取消公式（继承 V3.1，并加强）
//      - 在职/南昌3店/运营部 的“在职年限”由宏计算写固定值
//      - 离职/运营部离职 的“在职期限”由宏按 入职日期+离职日期 计算写固定值
//      - 薪资表“是否满7天/是否入职满2个月”由宏计算写固定值
//      - 其余字段：宏直接读数据库对应列，写入目标表固定值
//      - 数据库自身业务公式一律不改
//
//   B. 真正的批量 I/O（解决 WPS 点击“同步员工状态”卡死）
//      V3.1 虽然加了缓存，但仍然大量使用 Cells(r,c).Value 逐格读取，
//      1900+ 行的数据库 + 7 张派生表（上万个单元格）会产生
//      数万～数十万次 WPS 跨对象调用 —— 这才是卡死的真正原因。
//
//      V3.2 改为：
//        一次性 Range.Value 整块读入二维数组
//              ↓
//        JS 内存中完成：索引 / 状态判断 / 字段映射 / 值计算 / 排序
//              ↓
//        一次性 Range.Value 整块写回
//
//      全流程 WPS 跨对象调用从「数万次」降到「几十次」。
//      - 每张表的数据区只读 1 次、只写 1 次
//      - 绝不在循环里调用 Cells / End(xlUp) / Rows.Insert / Rows.Delete
//      - 增删改全部在内存数组上完成
//      - 行插入/删除在内存数组层面做（不触碰 WPS 对象）
//      - 排序一次性完成（在职、南昌3店 各一次）
//      - 全程不刷新界面、不弹窗、不调用 Application.Calculate
//
// 兼容性：单顶层函数；辅助函数全部用“函数表达式”；不用 forEach / 第三方库
//         所有 WPS 可选属性（ScreenUpdating / Calculation 等）都有安全兜底
// =====================================================================

function 同步员工状态() { _V32_Entry(false, false); }
function 全量校准()     { _V32_Entry(true,  false); }
function 数据检查()     { _V32_Entry(false, true ); }
function 同步日志()     { _V32_ShowLog(); }

// ============================ 常量配置（与 V3.1 完全一致） ============================
var DB_AU = 47;      // 员工状态
var DB_AV = 48;      // 同步状态
var DB_ID = 49;      // 员工ID
var DB_TIME = 50;    // 最后同步时间
var DB_RESULT = 51;  // 同步结果
var DB_NAME = 5;     // 姓名
var DB_JOIN = 3;     // 入职时间
var DB_INTV = 29;    // 面试时间
var DB_LEAVE = 27;   // 离职日期
var DB_STORE = 2;    // 门店名称
var DB_JOB = 8;      // 工种级别
var DB_MAXCOL = 51;

var ID_PREFIX = "RY";
var ID_DIGITS = 6;

// 员工状态 -> 目标表（正向）。业务规则与 V3 完全一致，未改动。
function _V32_StatusMap() {
  return {
    "邀约":         [],
    "面试":         ["招聘面试登记表"],
    "入职":         ["招聘面试登记表", "在职", "薪资表"],
    "离职":         ["招聘面试登记表", "离职", "薪资表"],
    "南昌三店":     ["招聘面试登记表", "南昌3店", "薪资表"],
    "南昌三店离职": ["招聘面试登记表", "离职", "薪资表"],
    "运营部":       ["招聘面试登记表", "运营部", "薪资表"],
    "运营部离职":   ["招聘面试登记表", "运营部离职", "薪资表"]
  };
}

// 派生表结构定义（表头行/起始行/姓名列/时间列/ID列/字段映射/是否排序）
// 与 V3.1 完全相同，未改动任何表头位置、数据起始行、字段顺序。
function _V32_Tables() {
  var zzMap = [[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8],[9,9],[10,10],[11,11],[12,12],[13,13],[14,14],[15,15],[16,16],[17,17],[18,18],[19,19],[20,20],[21,21],[22,22],[23,23],[24,24],[25,25]];
  var lzMap = [[2,2],[3,3],[4,36],[5,5],[6,6],[7,7],[8,8],[9,9],[10,10],[11,11],[12,12],[13,13],[14,14],[15,15],[16,16],[17,17],[18,18],[19,19],[20,20],[21,21],[22,22],[23,24],[24,26],[25,27],[26,25]];
  var zpMap = [[2,5],[3,7],[4,8],[5,28],[6,29],[7,30],[8,31],[9,32],[10,33],[11,3],[12,23],[13,34],[14,35],[15,25]];
  var xzMap = [[2,2],[3,3],[4,5],[5,8],[6,37],[7,38],[8,25],[9,39],[10,40],[11,41],[12,42],[13,43],[14,44],[15,45]];
  var ncMap = [[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8],[9,9],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],[16,17],[17,18],[18,19],[19,20],[20,21],[21,22],[22,23],[23,24],[24,25]];
  var yyMap = [[2,2],[3,3],[4,4],[5,5],[6,8],[7,10],[8,11],[9,12],[10,13],[11,21],[12,22],[13,6],[14,7],[15,15],[16,24]];
  var yyLzMap = [[2,2],[3,3],[4,4],[5,5],[6,8],[7,10],[8,11],[9,12],[10,13],[11,21],[12,22],[13,6],[14,7],[15,15],[16,24],[17,27],[18,26]];
  return [
    { name: "在职",         hdr: 2, start: 3, nameCol: 5, timeCol: 3, altTimeCol: 0,  idCol: 26, leaveCol: 27, leaveToCol: 0,  map: zzMap,   sorted: true  },
    { name: "离职",         hdr: 2, start: 3, nameCol: 5, timeCol: 3, altTimeCol: 0,  idCol: 27, leaveCol: 27, leaveToCol: 25, map: lzMap,   sorted: false },
    { name: "招聘面试登记表", hdr: 2, start: 4, nameCol: 2, timeCol: 6, altTimeCol: 11, idCol: 16, leaveCol: 27, leaveToCol: 0,  map: zpMap,   sorted: false },
    { name: "薪资表",       hdr: 1, start: 2, nameCol: 4, timeCol: 3, altTimeCol: 0,  idCol: 16, leaveCol: 27, leaveToCol: 0,  map: xzMap,   sorted: false },
    { name: "南昌3店",      hdr: 2, start: 3, nameCol: 5, timeCol: 3, altTimeCol: 0,  idCol: 26, leaveCol: 27, leaveToCol: 0,  map: ncMap,   sorted: true  },
    { name: "运营部",       hdr: 1, start: 2, nameCol: 5, timeCol: 3, altTimeCol: 0,  idCol: 17, leaveCol: 27, leaveToCol: 0,  map: yyMap,   sorted: false },
    { name: "运营部离职",   hdr: 1, start: 2, nameCol: 5, timeCol: 3, altTimeCol: 0,  idCol: 19, leaveCol: 27, leaveToCol: 17, map: yyLzMap, sorted: false }
  ];
}

// ============================ 工具函数 ============================
function _V32_ColLetter(c) {
  var s = "";
  while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
function _V32_Now() {
  var d = new Date();
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
         p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
function _V32_Text(v) {
  if (v == null) return "";
  return String(v).replace(/^\s+|\s+$/g, "");
}
function _V32_Date(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    var y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return y + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
  }
  var s = String(v).replace(/^\s+|\s+$/g, "");
  var mm = s.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (mm) {
    var M = parseInt(mm[2], 10), D = parseInt(mm[3], 10);
    return mm[1] + "-" + (M < 10 ? "0" + M : M) + "-" + (D < 10 ? "0" + D : D);
  }
  return s;
}
function _V32_DateObj(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  var s = String(v).replace(/^\s+|\s+$/g, "");
  var mm = s.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (mm) {
    var M = parseInt(mm[2], 10), D = parseInt(mm[3], 10);
    if (M < 1 || M > 12 || D < 1 || D > 31) return null;
    try { return new Date(parseInt(mm[1], 10), M - 1, D); } catch (e) { return null; }
  }
  var d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}
function _V32_FindTable(tables, name) {
  for (var i = 0; i < tables.length; i++) if (tables[i].name === name) return tables[i];
  return null;
}
function _V32_FormatId(seq) {
  var s = String(seq);
  while (s.length < ID_DIGITS) s = "0" + s;
  return ID_PREFIX + s;
}
function _V32_Status(v) { return _V32_Text(v); }
function _V32_IsValidStatus(s) {
  var m = _V32_StatusMap();
  return s !== "" && m[s] !== undefined;
}
function _V32_Targets(status) {
  var m = _V32_StatusMap();
  return (m[status] !== undefined) ? m[status] : null;
}
// 在数据库缓存中按员工ID找行号（仅唯一时有效，走内存）
function _V32_FindDbRowById(ctx, id) {
  if (!id) return 0;
  var rows = ctx.dbCache ? ctx.dbCache.rows : null;
  if (!rows) return 0;
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i].r;
  return 0;
}

// =====================================================================
// ★★★ V3.2 核心：批量 I/O 层 ★★★
// =====================================================================
// 一次性把整个数据区读成二维数组（1 次 WPS 调用），
// 所有读取之后都走内存；写完再一次性写回（1 次 WPS 调用）。
// 这是 V3.2 解决卡死的根本手段。
// =====================================================================

// 整块读：返回二维数组 grid[局部行][列]，以及实际行列数
//   ws      工作表
//   r1,c1   左上角
//   r2,c2   右下角（注意 r2 可能 <= r1，表示空区）
function _V32_BulkRead(ws, r1, c1, r2, c2) {
  var rows = Math.max(0, r2 - r1 + 1);
  var cols = Math.max(0, c2 - c1 + 1);
  if (rows === 0 || cols === 0) return { data: [], rows: 0, cols: 0, r1: r1, c1: c1 };
  var addr = _V32_ColLetter(c1) + r1 + ":" + _V32_ColLetter(c2) + r2;
  var v = null;
  try { v = ws.Range(addr).Value; } catch (e) { v = null; }
  var grid = [];
  if (rows === 1 && cols === 1) {
    // WPS 单格 Range.Value 直接返回标量
    grid = [[v]];
  } else {
    if (v == null) { v = []; }
    // 单行/单列的兜底归一化
    if (!(v[0] instanceof Array)) {
      // 可能是单行的一维数组（每个元素是单值数组）
      if (v.length === rows && cols === 1) {
        for (var i0 = 0; i0 < rows; i0++) grid.push([v[i0]]);
      } else if (v.length === cols && rows === 1) {
        var one = [];
        for (var j0 = 0; j0 < cols; j0++) one.push(v[j0]);
        grid.push(one);
      } else {
        grid = v;
      }
    } else {
      grid = v;
    }
  }
  // 规整成 rows × cols
  while (grid.length < rows) grid.push([]);
  for (var i = 0; i < rows; i++) {
    if (!(grid[i] instanceof Array)) grid[i] = [grid[i]];
    while (grid[i].length < cols) grid[i].push(null);
    if (grid[i].length > cols) grid[i].length = cols;
  }
  return { data: grid, rows: rows, cols: cols, r1: r1, c1: c1 };
}

// 整块写：把二维数组一次写回工作表（1 次 WPS 调用）
function _V32_BulkWrite(ws, r1, c1, grid) {
  if (!grid || grid.length === 0) return;
  var rows = grid.length;
  var cols = 0;
  for (var i = 0; i < rows; i++) if (grid[i] && grid[i].length > cols) cols = grid[i].length;
  if (cols === 0) return;
  // 补齐每行列数一致（WPS 要求规整矩形）
  for (var i2 = 0; i2 < rows; i2++) {
    if (!grid[i2]) grid[i2] = [];
    while (grid[i2].length < cols) grid[i2].push(null);
  }
  var addr = _V32_ColLetter(c1) + r1 + ":" + _V32_ColLetter(c1 + cols - 1) + (r1 + rows - 1);
  try {
    ws.Range(addr).Value = grid;
  } catch (e) {
    // 兜底：逐行写（仍比逐格快）
    for (var r = 0; r < rows; r++) {
      try { ws.Range(_V32_ColLetter(c1) + (r1 + r) + ":" + _V32_ColLetter(c1 + cols - 1) + (r1 + r)).Value = [grid[r]]; } catch (e2) {}
    }
  }
}

// 从 grid 取某单元格（内存读）
function _V32_G(grid, localRow, col) {
  if (!grid || localRow < 0 || localRow >= grid.length) return null;
  var row = grid[localRow];
  if (!row || col < 1 || col > row.length) return null;
  return row[col - 1];
}

// =====================================================================
// 上下文
// =====================================================================
function _V32_BuildContext(wb, prog) {
  if (!wb) { alert("未找到工作簿。"); return null; }
  if (wb.Sheets("数据库") == null) {
    alert("❌ 本文件没有『数据库』工作表。\n请确认宏装在本工作簿下（不是个人宏工作簿）。");
    return null;
  }
  var ctx = {
    wb: wb,
    DB: wb.Sheets("数据库"),
    update: prog || function () {},
    tables: null, tctx: {}, dbCache: null, idAlloc: null,
    stats: { bulkRead: 0, bulkWrite: 0, cellRead: 0, cellWrite: 0 }
  };
  ctx.stat = function (k, n) { ctx.stats[k] = (ctx.stats[k] || 0) + (n || 1); };
  return ctx;
}

// 求单列最后数据行（每张表只在初始化时调用，绝不在员工循环里调用）
function _V32_LastRowIn(ws, col) {
  try {
    var lr = ws.Cells(ws.Rows.Count, col).End(-4162).Row;   // xlUp
    if (lr > 0) return lr;
  } catch (e) {}
  try {
    var ur = ws.UsedRange;
    if (ur && ur.Row + ur.Rows.Count - 1 > 0) return ur.Row + ur.Rows.Count - 1;
  } catch (e2) {}
  return 0;
}
function _V32_LastRow(ws, cols) {
  var mx = 0;
  for (var i = 0; i < cols.length; i++) {
    var lr = _V32_LastRowIn(ws, cols[i]);
    if (lr > mx) mx = lr;
  }
  return mx;
}

// =====================================================================
// ★ 阶段1：初始化 —— 每张表只读一次（整块 Range.Value）
// =====================================================================
function _V32_InitTables(ctx) {
  var tables = _V32_Tables();
  ctx.tables = tables;
  var tctx = {};
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    var ws = ctx.wb.Sheets(t.name);
    // 该表数据区最后行（只算一次）
    var last = Math.max(
      _V32_LastRowIn(ws, t.nameCol),
      _V32_LastRowIn(ws, t.idCol),
      _V32_LastRowIn(ws, 1)
    );
    if (last < t.start) last = t.start - 1;
    // ★ 一次性整块读入该表数据区（1 次 WPS 调用读完全表）
    var rd = _V32_BulkRead(ws, t.start, 1, last, t.idCol);
    ctx.stat("bulkRead");
    var grid = rd.data;
    var info = {
      t: t, ws: ws, last: last, start: t.start,
      grid: grid,                      // 内存数据区（1-based 列，0-based 行）
      dirty: false,                    // 是否需要在最后批量写回
      extraRows: 0,                    // 内存中新增的行数
      byId: {},                        // 员工ID -> 局部行号(0-based)
      dupIdRows: {},                   // 员工ID -> [局部行号...]
      byNameDate: {},                  // 姓名|日期 -> 局部行号
      dupNameDate: {},                 // 姓名|日期 -> true（歧义）
      seqMax: undefined,
      formulaCount: 0
    };
    // 建立索引（全部在内存中完成，零 WPS 调用）
    var n = grid.length;
    for (var r = 0; r < n; r++) {
      var id = _V32_Text(_V32_G(grid, r, t.idCol));
      var nm = _V32_Text(_V32_G(grid, r, t.nameCol));
      if (id !== "") {
        if (info.byId[id] === undefined && info.dupIdRows[id] === undefined) info.byId[id] = r;
        else {
          if (info.dupIdRows[id] === undefined) { info.dupIdRows[id] = [info.byId[id]]; delete info.byId[id]; }
          info.dupIdRows[id].push(r);
        }
        var mm = String(id).match(/(\d+)\s*$/);
        if (mm) { var sn = parseInt(mm[1], 10); if (info.seqMax === undefined || sn > info.seqMax) info.seqMax = sn; }
      }
      if (nm !== "") {
        var d1 = _V32_Date(_V32_G(grid, r, t.timeCol));
        if (d1 !== "") _V32_IndexDate(info, nm, d1, r);
        if (t.altTimeCol) {
          var d2 = _V32_Date(_V32_G(grid, r, t.altTimeCol));
          if (d2 !== "" && d2 !== d1) _V32_IndexDate(info, nm, d2, r);
        }
      }
      // 公式统计（内存读，无需再访问 WPS）
      for (var c = 1; c <= t.idCol; c++) {
        var vv = _V32_G(grid, r, c);
        if (typeof vv === "string" && vv.length > 0 && vv.charAt(0) === "=") info.formulaCount++;
      }
    }
    tctx[t.name] = info;
  }
  ctx.tctx = tctx;
  return tctx;
}
function _V32_IndexDate(info, nm, dstr, r) {
  var k = nm + "|" + dstr;
  if (info.byNameDate[k] === undefined && !info.dupNameDate[k]) info.byNameDate[k] = r;
  else { info.dupNameDate[k] = true; delete info.byNameDate[k]; }
}

// ★ 数据库一次性整块读入内存
function _V32_LoadDB(ctx) {
  var DB = ctx.DB;
  var last = _V32_LastRow(DB, [DB_NAME, DB_AU, DB_ID]);
  var rd = _V32_BulkRead(DB, 3, 1, last, DB_MAXCOL);
  ctx.stat("bulkRead");
  ctx.dbGrid = rd.data;
  var rows = [];
  var n = rd.data.length;
  for (var i = 0; i < n; i++) {
    var r = 3 + i;
    var g = rd.data[i];
    var name = _V32_Text(g[DB_NAME - 1]);
    var status = _V32_Text(g[DB_AU - 1]);
    var id = _V32_Text(g[DB_ID - 1]);
    if (name === "" && status === "" && id === "") {
      // 空行也保留（保证行号对齐），但不参与业务
      rows.push({ r: r, blank: true, name: "", status: "", av: "", id: "", store: "", job: "", join: "", intv: "", leave: "" });
      continue;
    }
    rows.push({
      r: r, blank: false,
      name: name, status: status,
      av: _V32_Text(g[DB_AV - 1]),
      id: id,
      store: _V32_Text(g[DB_STORE - 1]),
      job: _V32_Text(g[DB_JOB - 1]),
      join: _V32_Date(g[DB_JOIN - 1]),
      intv: _V32_Date(g[DB_INTV - 1]),
      leave: _V32_Date(g[DB_LEAVE - 1])
    });
  }
  ctx.dbCache = { last: last, rows: rows, first: 3 };
  // 全局员工ID分配（内存递增，永不复用）
  var maxSeq = 0, used = {}, dupRows = {};
  for (var j = 0; j < rows.length; j++) {
    var idv = rows[j].id;
    if (idv === "") continue;
    if (used[idv] === undefined && dupRows[idv] === undefined) used[idv] = rows[j].r;
    else {
      if (dupRows[idv] === undefined) { dupRows[idv] = [used[idv]]; delete used[idv]; }
      dupRows[idv].push(rows[j].r);
    }
    var mm2 = String(idv).match(/(\d+)\s*$/);
    if (mm2) { var n2 = parseInt(mm2[1], 10); if (n2 > maxSeq) maxSeq = n2; }
  }
  ctx.idAlloc = { seq: maxSeq, used: used, dupRows: dupRows };
  return ctx.dbCache;
}
function _V32_AllocId(ctx) {
  var a = ctx.idAlloc;
  while (true) {
    a.seq++;
    var cand = _V32_FormatId(a.seq);
    if (a.used[cand] === undefined && a.dupRows[cand] === undefined) { a.used[cand] = -1; return cand; }
  }
}

// =====================================================================
// 内存索引操作
// =====================================================================
function _V32_FindById(ctx, tname, id) {
  if (!id) return -1;
  var info = ctx.tctx[tname];
  return info.byId[id] !== undefined ? info.byId[id] : -1;
}
function _V32_IsDupId(ctx, tname, id) {
  var info = ctx.tctx[tname];
  return !!(info.dupIdRows[id]);
}
// 姓名+日期 兜底匹配（内存索引 + 门店二次校验）
function _V32_FindByNameDate(ctx, t, d) {
  var info = ctx.tctx[t.name];
  var keys = [];
  if (d.join !== "") keys.push(d.name + "|" + d.join);
  if (d.intv !== "" && d.intv !== d.join) keys.push(d.name + "|" + d.intv);
  for (var i = 0; i < keys.length; i++) {
    if (info.dupNameDate[keys[i]]) continue;
    var r = info.byNameDate[keys[i]];
    if (r === undefined) continue;
    var rs = _V32_Text(_V32_G(info.grid, r, 2));
    if (rs !== "" && d.store !== "" && rs !== d.store) continue;
    return r;
  }
  return -1;
}

// =====================================================================
// 值计算：司龄 / 满7天 / 满2个月（派生表零公式的核心）
// =====================================================================
function _V32_DiffYM(fromD, toD) {
  var y = toD.getFullYear() - fromD.getFullYear();
  var m = toD.getMonth() - fromD.getMonth();
  var d = toD.getDate() - fromD.getDate();
  if (d < 0) m--;
  if (m < 0) { y--; m += 12; }
  return { y: y, m: m };
}
function _V32_TenureText(joinStr) {
  var jd = _V32_DateObj(joinStr);
  if (jd == null) return "";
  var r = _V32_DiffYM(jd, new Date());
  return r.y + "年" + r.m + "个月";
}
function _V32_TenureLeaveText(joinStr, leaveStr) {
  var jd = _V32_DateObj(joinStr), ld = _V32_DateObj(leaveStr);
  if (jd == null || ld == null) return "";
  var r = _V32_DiffYM(jd, ld);
  return r.y + "年" + r.m + "个月";
}
function _V32_SevenDaysText(joinStr, leaveStr) {
  var jd = _V32_DateObj(joinStr);
  if (jd == null) return "";
  var ld = _V32_DateObj(leaveStr);
  var ref = ld != null ? ld : new Date();
  var diff = Math.floor((ref.getTime() - jd.getTime()) / 86400000);
  return diff < 7 ? "未达7天" : "入职满7天";
}
function _V32_TwoMonthText(joinStr, leaveStr) {
  var jd = _V32_DateObj(joinStr);
  if (jd == null) return "";
  var ld = _V32_DateObj(leaveStr);
  var ref = ld != null ? ld : new Date();
  var ym = _V32_DiffYM(jd, ref);
  var months = ym.y * 12 + ym.m;
  return months < 2 ? "未达2个月" : "入职满2个月";
}
function _V32_ComputedValue(tname, toCol, d) {
  if (tname === "在职" || tname === "南昌3店") { if (toCol === 4) return _V32_TenureText(d.join); }
  if (tname === "离职") { if (toCol === 4) return _V32_TenureLeaveText(d.join, d.leave); }
  if (tname === "运营部") { if (toCol === 4) return _V32_TenureText(d.join); }
  if (tname === "运营部离职") { if (toCol === 4) return _V32_TenureLeaveText(d.join, d.leave); }
  if (tname === "薪资表") {
    if (toCol === 14) return _V32_SevenDaysText(d.join, d.leave);
    if (toCol === 15) return _V32_TwoMonthText(d.join, d.leave);
  }
  return undefined;
}

// 在内存 grid 中写入一行（不触碰 WPS）
function _V32_FillGridRow(ctx, t, info, localRow, d, id) {
  var row = info.grid[localRow];
  if (!row) { row = []; info.grid[localRow] = row; }
  for (var i = 0; i < t.map.length; i++) {
    var toCol = t.map[i][0], fromCol = t.map[i][1];
    var cv = _V32_ComputedValue(t.name, toCol, d);
    var val;
    if (cv !== undefined) val = cv;
    else {
      val = (d._raw && d._raw[fromCol] !== undefined) ? d._raw[fromCol] : null;
      if (val === null) val = _V32_G(ctx.dbGrid, d.r - 3, fromCol);
    }
    row[toCol - 1] = val;
  }
  row[t.idCol - 1] = String(id);   // 员工ID 强制文本
  info.dirty = true;
}

// =====================================================================
// 主入口（分阶段）
// =====================================================================
function _V32_Entry(isFull, isCheck) {
  var wb = ThisWorkbook;
  var log = [];
  var prog = function (msg) { try { Application.StatusBar = msg; } catch (e) {} };
  // 记录并关闭界面刷新（有无该属性都安全）
  var oldSU = null, oldCalc = null;
  try { oldSU = Application.ScreenUpdating; Application.ScreenUpdating = false; } catch (e) {}
  try {
    prog("正在初始化...");
    var ctx = _V32_BuildContext(wb, prog);
    if (!ctx) { return; }

    prog("正在建立索引...");
    _V32_InitTables(ctx);
    _V32_LoadDB(ctx);

    if (isCheck) { _V32_CheckData(ctx); prog(""); _V32_Restore(oldSU, oldCalc); return; }

    prog("正在同步...");
    var r = isFull ? _V32_FullReconcile(ctx, log) : _V32_Incremental(ctx, log);

    // 阶段5：排序（在职、南昌3店 各一次，内存排序）
    prog("正在排序...");
    _V32_SortTable(ctx, "在职");
    _V32_SortTable(ctx, "南昌3店");

    // 阶段6：清理公式（派生表转固定值）
    prog("正在清理公式...");
    var conv = _V32_StripFormulas(ctx);

    // 阶段3/4：一次性批量写回所有派生表（每表 1 次 WPS 调用）
    prog("正在写入派生表...");
    var wrote = _V32_FlushTables(ctx);

    // 阶段7：写数据库同步状态（一次性批量写回）
    prog("正在写同步状态...");
    _V32_FlushDB(ctx);

    // 阶段8：日志
    prog("正在写入日志...");
    _V32_WriteLog(ctx, log);

    prog("");
    _V32_Restore(oldSU, oldCalc);
    _V32_Report(ctx, r, log, isFull, conv, wrote);
  } catch (e) {
    _V32_Restore(oldSU, oldCalc);
    try { Application.StatusBar = ""; } catch (e0) {}
    alert("宏执行出错：\n" + (e && e.message ? e.message : e) +
          "\n\n请把此信息反馈给维护人员。");
  }
}
function _V32_Restore(oldSU, oldCalc) {
  try { if (oldSU != null) Application.ScreenUpdating = oldSU; } catch (e) {}
  try { if (oldCalc != null) Application.Calculation = oldCalc; } catch (e) {}
  try { Application.StatusBar = ""; } catch (e) {}
}

// =====================================================================
// 增量同步（全部在内存中做）
// =====================================================================
function _V32_Incremental(ctx, log) {
  var res = { scan: 0, synced: 0, added: 0, removed: 0, updated: 0, failed: 0, idGen: 0, errors: [], log: log };
  var rows = ctx.dbCache.rows;
  var dupRows = ctx.idAlloc.dupRows;

  // 重复ID：整组跳过
  for (var di in dupRows) {
    if (!dupRows.hasOwnProperty(di)) continue;
    var rowList = dupRows[di].join("、");
    res.failed++;
    res.errors.push("员工ID重复：" + di + "（数据库行 " + rowList + "）→ 已跳过该员工ID");
    _V32_PushLog(log, dupRows[di][0], di, "", "", "", "数据库", "重复ID跳过", "失败", "重复于数据库行 " + rowList);
    for (var dr = 0; dr < dupRows[di].length; dr++) {
      _V32_SetDbCell(ctx, dupRows[di][dr], DB_RESULT, "失败：员工ID重复(" + di + ") 需人工处理");
    }
  }

  for (var i = 0; i < rows.length; i++) {
    var d = rows[i];
    if (d.blank || d.name === "") continue;
    if (d.status === "" || d.status === d.av) continue;
    if (d.id !== "" && dupRows[d.id] !== undefined) continue;
    res.scan++;

    if (!_V32_IsValidStatus(d.status)) {
      res.failed++;
      res.errors.push("行" + d.r + " " + d.name + "：非法状态『" + d.status + "』");
      _V32_SetDbCell(ctx, d.r, DB_RESULT, "失败：非法员工状态");
      continue;
    }
    if (d.id === "") { d.id = _V32_AllocId(ctx); res.idGen++; _V32_SetDbCell(ctx, d.r, DB_ID, d.id); }

    var rec = _V32_MakeRec(ctx, d);
    var diff = _V32_Diff(d.av, d.status);
    var failMsg = "";
    var logRows = [];

    for (var x = 0; x < diff.del.length; x++) {
      var t = _V32_FindTable(ctx.tables, diff.del[x]);
      try {
        var okd = _V32_DeleteRow(ctx, t, rec.id, rec);
        if (okd) { res.removed++; logRows.push({ sheet: t.name, op: "移除", r: "成功" }); }
        else logRows.push({ sheet: t.name, op: "移除", r: "无记录" });
      } catch (e) { failMsg = t.name + " 删除失败"; res.errors.push("行" + d.r + " " + d.name + "：" + failMsg); logRows.push({ sheet: t.name, op: "移除", r: "失败" }); }
    }
    for (var y = 0; y < diff.add.length; y++) {
      var t2 = _V32_FindTable(ctx.tables, diff.add[y]);
      try {
        var act = _V32_UpsertRow(ctx, t2, rec, rec.id);
        if (act === "新增") { res.added++; logRows.push({ sheet: t2.name, op: "新增", r: "成功" }); }
        else if (act === "更新" || act === "补ID更新") { res.updated++; logRows.push({ sheet: t2.name, op: act === "补ID更新" ? "补ID更新" : "更新", r: "成功" }); }
        else if (act === "重复异常") { res.errors.push("行" + d.r + " " + d.name + "：" + t2.name + " 重复ID"); logRows.push({ sheet: t2.name, op: "新增", r: "异常" }); }
      } catch (e2) { failMsg = t2.name + " 写入失败"; res.errors.push("行" + d.r + " " + d.name + "：" + failMsg); logRows.push({ sheet: t2.name, op: "新增", r: "失败" }); }
    }

    if (failMsg === "") {
      _V32_SetDbCell(ctx, d.r, DB_AV, d.status);
      _V32_SetDbCell(ctx, d.r, DB_TIME, _V32_Now());
      _V32_SetDbCell(ctx, d.r, DB_RESULT, "成功");
      res.synced++;
    } else {
      _V32_SetDbCell(ctx, d.r, DB_RESULT, "部分失败：" + failMsg);
    }
    if (logRows.length === 0) {
      _V32_PushLog(log, d.r, rec.id, d.name, d.av, d.status, "无表变化", "—", failMsg === "" ? "成功" : "失败", failMsg);
    } else {
      for (var lj = 0; lj < logRows.length; lj++) {
        _V32_PushLog(log, d.r, rec.id, d.name, d.av, d.status, logRows[lj].sheet, logRows[lj].op, logRows[lj].r === "成功" ? "成功" : logRows[lj].r, failMsg);
      }
    }
  }
  return res;
}

// =====================================================================
// 全量校准（全部在内存中做）
// =====================================================================
function _V32_FullReconcile(ctx, log) {
  var res = { scan: 0, synced: 0, added: 0, removed: 0, updated: 0, failed: 0, idGen: 0, errors: [], log: log };
  var rows = ctx.dbCache.rows;
  var dupRows = ctx.idAlloc.dupRows;

  var dupIds = {};
  for (var di in dupRows) {
    if (!dupRows.hasOwnProperty(di)) continue;
    dupIds[di] = dupRows[di].slice();
    var rowList = dupRows[di].join("、");
    res.failed++;
    res.errors.push("员工ID重复：" + di + "（数据库行 " + rowList + "）→ 已停止对该员工ID自动校准");
    _V32_PushLog(log, dupRows[di][0], di, "", "", "", "数据库", "重复ID停止校准", "失败", "重复于数据库行 " + rowList);
    for (var dr = 0; dr < dupRows[di].length; dr++) {
      _V32_SetDbCell(ctx, dupRows[di][dr], DB_RESULT, "失败：员工ID重复(" + di + ") 需人工处理");
    }
  }

  var expect = {};
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i];
    if (d.blank || d.name === "") continue;
    if (d.id !== "" && dupIds[d.id] !== undefined) continue;
    if (d.id === "") { d.id = _V32_AllocId(ctx); res.idGen++; _V32_SetDbCell(ctx, d.r, DB_ID, d.id); }
    if (d.status === "") continue;
    if (!_V32_IsValidStatus(d.status)) {
      res.failed++;
      res.errors.push("行" + d.r + " " + d.name + "：非法状态『" + d.status + "』");
      _V32_SetDbCell(ctx, d.r, DB_RESULT, "失败：非法员工状态");
      continue;
    }
    res.scan++;
    var targets = _V32_Targets(d.status);
    var should = {};
    for (var s = 0; s < targets.length; s++) should[targets[s]] = 1;
    expect[d.id] = { should: should, name: d.name };

    var rec = _V32_MakeRec(ctx, d);
    var failMsg = "";
    var logRows = [];
    for (var j = 0; j < targets.length; j++) {
      var t = _V32_FindTable(ctx.tables, targets[j]);
      try {
        var act = _V32_UpsertRow(ctx, t, rec, d.id);
        if (act === "新增") { res.added++; logRows.push({ sheet: t.name, op: "补建", r: "成功" }); }
        else if (act === "更新" || act === "补ID更新") { res.updated++; logRows.push({ sheet: t.name, op: "更新", r: "成功" }); }
        else if (act === "重复异常") { res.errors.push("行" + d.r + " " + d.name + "：" + t.name + " 重复ID"); logRows.push({ sheet: t.name, op: "补建", r: "异常" }); }
      } catch (e) { failMsg = t.name + " 写入失败"; res.errors.push("行" + d.r + " " + d.name + "：" + failMsg); logRows.push({ sheet: t.name, op: "补建", r: "失败" }); }
    }
    if (failMsg === "") {
      if (d.av !== d.status) _V32_SetDbCell(ctx, d.r, DB_AV, d.status);
      _V32_SetDbCell(ctx, d.r, DB_TIME, _V32_Now());
      _V32_SetDbCell(ctx, d.r, DB_RESULT, "成功");
      res.synced++;
    } else {
      _V32_SetDbCell(ctx, d.r, DB_RESULT, "部分失败：" + failMsg);
    }
    for (var lj = 0; lj < logRows.length; lj++) {
      _V32_PushLog(log, d.r, d.id, d.name, d.av, d.status, logRows[lj].sheet, logRows[lj].op, logRows[lj].r, failMsg);
    }
  }

  // 反向清理：派生表里数据库不该有的行（内存标记 → 内存压缩 → 批量写回）
  for (var ti = 0; ti < ctx.tables.length; ti++) {
    var t3 = ctx.tables[ti];
    var info = ctx.tctx[t3.name];
    var keepRows = [];
    var n3 = info.grid.length;
    for (var r3 = 0; r3 < n3; r3++) {
      var rid = _V32_Text(_V32_G(info.grid, r3, t3.idCol));
      var rnm = _V32_Text(_V32_G(info.grid, r3, t3.nameCol));
      if (rnm === "" && rid === "") continue;
      var keep = false;
      if (rid !== "" && dupIds[rid] !== undefined) keep = true;              // 重复ID保护
      else if (rid !== "" && expect[rid] !== undefined) { if (expect[rid].should[t3.name]) keep = true; }
      else if (rid === "") keep = true;                                       // 无ID历史行：保守保留
      if (keep) keepRows.push(info.grid[r3]);
      else {
        res.removed++;
        _V32_PushLog(log, 0, rid, rnm, "", "", t3.name, "删除", "成功", "");
      }
    }
    if (keepRows.length !== n3) {
      info.grid = keepRows;
      info.last = t3.start + keepRows.length - 1;
      info.dirty = true;
    }
    _V32_RebuildIndex(ctx, t3);
  }
  return res;
}

// =====================================================================
// 记录构造 / 增删改（全部在内存 grid 上完成，零 WPS 调用）
// =====================================================================
function _V32_MakeRec(ctx, d) {
  return {
    r: d.r, id: d.id, name: d.name, status: d.status,
    store: d.store, job: d.job,
    isMgr: d.job.indexOf("店长") >= 0,
    join: d.join, intv: d.intv, leave: d.leave,
    _raw: _V32_RawRow(ctx, d.r)
  };
}
function _V32_RawRow(ctx, r) {
  var cache = ctx._rawCache || (ctx._rawCache = {});
  if (cache[r]) return cache[r];
  var row = {};
  var g = ctx.dbGrid ? ctx.dbGrid[r - 3] : null;
  if (g) for (var c = 1; c <= DB_MAXCOL; c++) row[c] = g[c - 1];
  else for (var c2 = 1; c2 <= DB_MAXCOL; c2++) row[c2] = null;
  cache[r] = row;
  return row;
}
function _V32_Diff(oldStatus, newStatus) {
  var oldT = _V32_Targets(oldStatus) || [];
  var newT = _V32_Targets(newStatus) || [];
  var add = [], del = [];
  for (var i = 0; i < newT.length; i++) if (oldT.indexOf(newT[i]) < 0) add.push(newT[i]);
  for (var j = 0; j < oldT.length; j++) if (newT.indexOf(oldT[j]) < 0) del.push(oldT[j]);
  return { add: add, del: del };
}

// 内存追加一行到表尾
function _V32_AppendRow(ctx, t, d, id) {
  var info = ctx.tctx[t.name];
  var row = [];
  for (var c = 1; c <= t.idCol; c++) row.push(null);
  row[0] = _V32_NextSeq(ctx, t, info, -1);
  var lr = info.grid.length;
  info.grid.push(row);
  _V32_FillGridRow(ctx, t, info, lr, d, id);
  _V32_IndexAdd(info, id, lr, d);
  info.last = t.start + info.grid.length - 1;
  return lr;
}
function _V32_NextSeq(ctx, t, info, skipLocal) {
  if (info.seqMax === undefined) {
    var mx = 0;
    for (var r = 0; r < info.grid.length; r++) {
      if (r === skipLocal) continue;
      var v = _V32_G(info.grid, r, 1);
      if (v != null && v !== "" && !isNaN(Number(v))) { if (Number(v) > mx) mx = Number(v); }
    }
    info.seqMax = mx;
  }
  info.seqMax++;
  return info.seqMax;
}

// 内存“排序插入”（在职 / 南昌3店）：门店分组 → 店长优先 → 入职时间升序
function _V32_InsertSortedRow(ctx, t, d, id) {
  var info = ctx.tctx[t.name];
  var gStart = -1, gEnd = -1;
  for (var r = 0; r < info.grid.length; r++) {
    var s = _V32_Text(_V32_G(info.grid, r, 2));
    if (s === "") continue;
    if (s === d.store) { if (gStart < 0) gStart = r; gEnd = r; }
  }
  var lr;
  if (gStart < 0) {
    lr = info.grid.length;
  } else {
    lr = gEnd + 1;
    for (var r2 = gStart; r2 <= gEnd; r2++) {
      var exMgr = (_V32_Text(_V32_G(info.grid, r2, 8)).indexOf("店长") >= 0);
      var exDate = _V32_Date(_V32_G(info.grid, r2, 3));
      var before = false;
      if (d.isMgr && !exMgr) before = true;
      else if (d.isMgr === exMgr) {
        if (d.join !== "" && exDate !== "") before = (d.join < exDate);
        else if (d.join !== "" && exDate === "") before = true;
        else if (d.join === "" && exDate !== "") before = false;
      }
      if (before) { lr = r2; break; }
    }
  }
  var row = [];
  for (var c = 1; c <= t.idCol; c++) row.push(null);
  info.grid.splice(lr, 0, row);
  row[0] = _V32_NextSeq(ctx, t, info, -1);
  _V32_FillGridRow(ctx, t, info, lr, d, id);
  _V32_ReindexFrom(ctx, t, lr);
  info.last = t.start + info.grid.length - 1;
  return lr;
}

// Upsert：不存在则新增，存在则更新（全部走内存索引）
function _V32_UpsertRow(ctx, t, d, id) {
  var info = ctx.tctx[t.name];
  var hit = _V32_FindById(ctx, t.name, id);
  if (hit < 0 && _V32_IsDupId(ctx, t.name, id)) return "重复异常";
  if (hit < 0) {
    var fb = _V32_FindByNameDate(ctx, t, d);
    if (fb >= 0) {
      _V32_FillGridRow(ctx, t, info, fb, d, id);
      info.byId[id] = fb;
      return "补ID更新";
    }
    if (t.sorted) _V32_InsertSortedRow(ctx, t, d, id);
    else _V32_AppendRow(ctx, t, d, id);
    return "新增";
  }
  _V32_FillGridRow(ctx, t, info, hit, d, id);
  return "更新";
}

// 删除（内存中移除行）
function _V32_DeleteRow(ctx, t, id, d) {
  var info = ctx.tctx[t.name];
  if (_V32_IsDupId(ctx, t.name, id)) return false;
  var hit = _V32_FindById(ctx, t.name, id);
  if (hit < 0) {
    var fb = _V32_FindByNameDate(ctx, t, d);
    if (fb < 0) return false;
    hit = fb;
  }
  info.grid.splice(hit, 1);
  info.last = t.start + info.grid.length - 1;
  info.dirty = true;
  _V32_RebuildIndex(ctx, t);
  return true;
}

// 重建某表内存索引
function _V32_RebuildIndex(ctx, t) {
  var info = ctx.tctx[t.name];
  info.byId = {}; info.dupIdRows = {}; info.byNameDate = {}; info.dupNameDate = {};
  for (var r = 0; r < info.grid.length; r++) {
    var id = _V32_Text(_V32_G(info.grid, r, t.idCol));
    var nm = _V32_Text(_V32_G(info.grid, r, t.nameCol));
    if (id !== "") {
      if (info.byId[id] === undefined && info.dupIdRows[id] === undefined) info.byId[id] = r;
      else { if (info.dupIdRows[id] === undefined) { info.dupIdRows[id] = [info.byId[id]]; delete info.byId[id]; } info.dupIdRows[id].push(r); }
    }
    if (nm !== "") {
      var d1 = _V32_Date(_V32_G(info.grid, r, t.timeCol));
      if (d1 !== "") _V32_IndexDate(info, nm, d1, r);
      if (t.altTimeCol) {
        var d2 = _V32_Date(_V32_G(info.grid, r, t.altTimeCol));
        if (d2 !== "" && d2 !== d1) _V32_IndexDate(info, nm, d2, r);
      }
    }
  }
}
function _V32_ReindexFrom(ctx, t, fromLocal) {
  // 插入后：自 fromLocal 起重建（保持行号正确）
  _V32_RebuildIndex(ctx, t);
}
function _V32_IndexAdd(info, id, r, d) {
  if (id !== "" && info.byId[id] === undefined && info.dupIdRows[id] === undefined) info.byId[id] = r;
  if (d && d.name) {
    var k = d.name + "|" + d.join;
    if (d.join !== "" && info.byNameDate[k] === undefined && !info.dupNameDate[k]) info.byNameDate[k] = r;
  }
}

// =====================================================================
// 阶段5：排序（内存排序，每表一次）
// =====================================================================
function _V32_SortTable(ctx, tname) {
  var t = _V32_FindTable(ctx.tables, tname);
  if (!t || !t.sorted) return;
  var info = ctx.tctx[tname];
  var arr = [];
  for (var r = 0; r < info.grid.length; r++) {
    var nm = _V32_Text(_V32_G(info.grid, r, t.nameCol));
    if (nm === "") continue;
    arr.push({
      store: _V32_Text(_V32_G(info.grid, r, 2)),
      isMgr: (_V32_Text(_V32_G(info.grid, r, 8)).indexOf("店长") >= 0) ? 0 : 1,
      join: _V32_Date(_V32_G(info.grid, r, 3)),
      row: info.grid[r]
    });
  }
  if (arr.length === 0) return;
  var storeOrder = [], so = {};
  for (var i = 0; i < arr.length; i++) {
    if (so[arr[i].store] === undefined) { so[arr[i].store] = storeOrder.length; storeOrder.push(arr[i].store); }
  }
  arr.sort(function (a, b) {
    var sa = so[a.store], sb = so[b.store];
    if (sa !== sb) return sa - sb;
    if (a.isMgr !== b.isMgr) return a.isMgr - b.isMgr;
    var da = a.join === "" ? "9999-99-99" : a.join;
    var db2 = b.join === "" ? "9999-99-99" : b.join;
    if (da < db2) return -1;
    if (da > db2) return 1;
    return 0;
  });
  var newGrid = [];
  for (var w = 0; w < arr.length; w++) {
    var rowData = arr[w].row;
    if (rowData[0] !== undefined) rowData[0] = w + 1;   // 序号重排
    newGrid.push(rowData);
  }
  info.grid = newGrid;
  info.last = t.start + newGrid.length - 1;
  info.dirty = true;
  _V32_RebuildIndex(ctx, t);
}

// =====================================================================
// 阶段6：清理公式（派生表转固定值）
// =====================================================================
// 在内存中把任何 "="开头的公式单元格，替换为宏自己算出的固定值。
// 对应关系（与 V3.1 一致）：
//   col4  → 在职年限（在职/南昌3店/运营部 用 TODAY；离职/运营部离职 用离职日期）
//   col14 → 是否满7天（薪资表）   col15 → 是否满2个月（薪资表）
//   其他  → 取数据库对应字段重新写入固定值（避免取到公式本身）
function _V32_StripFormulas(ctx) {
  var total = 0;
  for (var i = 0; i < ctx.tables.length; i++) {
    var t = ctx.tables[i];
    var info = ctx.tctx[t.name];
    var n = info.grid.length;
    for (var r = 0; r < n; r++) {
      for (var c = 1; c <= t.idCol; c++) {
        var v = _V32_G(info.grid, r, c);
        if (!(typeof v === "string" && v.length > 0 && v.charAt(0) === "=")) continue;
        var join = _V32_Date(_V32_G(info.grid, r, 3));
        var leave = "";
        if (t.leaveToCol > 0) leave = _V32_Date(_V32_G(info.grid, r, t.leaveToCol));
        if (leave === "") {
          var rid = _V32_Text(_V32_G(info.grid, r, t.idCol));
          if (rid !== "") {
            var dr = _V32_FindDbRowById(ctx, rid);
            if (dr > 0) leave = _V32_Date(_V32_G(ctx.dbGrid, dr - 3, DB_LEAVE));
          }
        }
        var fixed;
        if (c === 4) {
          fixed = (t.name === "离职" || t.name === "运营部离职") ? _V32_TenureLeaveText(join, leave) : _V32_TenureText(join);
        } else if (c === 14) fixed = _V32_SevenDaysText(join, leave);
        else if (c === 15) fixed = _V32_TwoMonthText(join, leave);
        else {
          // 其他公式列：用字段映射反查数据库值；找不到则保留原显示（空）
          fixed = _V32_FromMapOrDb(ctx, t, c, r);
        }
        info.grid[r][c - 1] = fixed;
        info.dirty = true;
        total++;
      }
    }
  }
  return total;
}
function _V32_FromMapOrDb(ctx, t, toCol, localRow) {
  // 目标列 -> 数据库列
  for (var i = 0; i < t.map.length; i++) {
    if (t.map[i][0] === toCol) {
      var fromCol = t.map[i][1];
      var rid = _V32_Text(_V32_G(ctx.tctx[t.name].grid, localRow, t.idCol));
      if (rid !== "") {
        var dr = _V32_FindDbRowById(ctx, rid);
        if (dr > 0) return _V32_G(ctx.dbGrid, dr - 3, fromCol);
      }
      return null;
    }
  }
  return null;
}

// =====================================================================
// 阶段3/4：一次性批量写回所有派生表（每表 1 次 WPS 调用）
// =====================================================================
function _V32_FlushTables(ctx) {
  var wrote = 0;
  for (var i = 0; i < ctx.tables.length; i++) {
    var t = ctx.tables[i];
    var info = ctx.tctx[t.name];
    if (!info.dirty) continue;
    var n = info.grid.length;
    // 写入前先记录工作表「同步前实际数据区末尾」。
    // 注意：不能用 max_row（可能含格式/残留），要用真实的姓名列/ID列/序号列末行。
    // 优先用已登记值；否则现场求一次（只在首次用，之后走缓存）。
    var oldLast = info.wasLast;
    if (oldLast === undefined) {
      oldLast = info.last;                 // info.last 是初始化时按真实数据区算出的末行
      var l2 = 0, l3 = 0;
      try { l2 = _V32_LastRowIn(info.ws, t.idCol); } catch (e1) {}
      try { l3 = _V32_LastRowIn(info.ws, 1); } catch (e2) {}
      if (l2 > oldLast) oldLast = l2;
      if (l3 > oldLast) oldLast = l3;
    }
    if (n === 0) {
      // 空表：必须把原数据区整段清掉，不能只 return
      try {
        if (oldLast >= t.start) info.ws.Range(t.start + ":" + oldLast).ClearContents();
      } catch (e) {}
      info.last = t.start - 1;
      info.wasLast = t.start - 1;
      continue;
    }
    // 规范化：每行列数一致，缺的补 null
    var out = [];
    for (var r = 0; r < n; r++) {
      var row = info.grid[r];
      if (!(row instanceof Array)) row = [row];
      while (row.length < t.idCol) row.push(null);
      if (row.length > t.idCol) row.length = t.idCol;
      out.push(row);
    }
    _V32_BulkWrite(info.ws, t.start, 1, out);
    ctx.stat("bulkWrite");
    wrote++;
    info.last = t.start + n - 1;
    // ★ 关键修复：批量写回后必须清理尾部残留行。
    //   规则：旧数据区 t.start .. oldLast，新数据区 t.start .. newLast
    //   若 oldLast > newLast → 批量清除 (newLast+1) .. oldLast
    //   批量 Range.ClearContents（1 次调用），绝不逐格清。
    var newLast = t.start + n - 1;
    if (oldLast > newLast) {
      try { info.ws.Range((newLast + 1) + ":" + oldLast).ClearContents(); ctx.stat("bulkClear"); } catch (e3) {}
    }
    info.wasLast = newLast;
    // 员工ID列强制文本格式（防止科学计数法）
    try {
      info.ws.Range(_V32_ColLetter(t.idCol) + t.start + ":" + _V32_ColLetter(t.idCol) + newLast).NumberFormat = "@";
    } catch (e4) {}
  }
  return wrote;
}

// =====================================================================
// 阶段7：数据库同步状态批量写回
// =====================================================================
function _V32_SetDbCell(ctx, r, c, v) {
  var cache = ctx._dbWrites || (ctx._dbWrites = {});
  var key = r + "_" + c;
  cache[key] = { r: r, c: c, v: v };
}
function _V32_FlushDB(ctx) {
  var cache = ctx._dbWrites;
  if (!cache) return;
  // 按行归组，一次性写回（每行一个 Range，但行数很少：只有状态变化的行）
  var byRow = {};
  for (var k in cache) {
    if (!cache.hasOwnProperty(k)) continue;
    var w = cache[k];
    if (!byRow[w.r]) byRow[w.r] = {};
    byRow[w.r][w.c] = w.v;
  }
  // 数据库的 47~51 连续，可整段一次写
  var rowsToWrite = [];
  for (var rr in byRow) { if (byRow.hasOwnProperty(rr)) rowsToWrite.push(parseInt(rr, 10)); }
  if (rowsToWrite.length === 0) return;
  rowsToWrite.sort(function (a, b) { return a - b; });
  // 逐行批量写 47..51（5 列一次写）
  for (var i = 0; i < rowsToWrite.length; i++) {
    var r0 = rowsToWrite[i];
    var vals = byRow[r0];
    var arr5 = [];
    for (var c = 47; c <= 51; c++) {
      arr5.push(vals[c] !== undefined ? vals[c] : _V32_G(ctx.dbGrid, r0 - 3, c));
    }
    try {
      ctx.DB.Range("AU" + r0 + ":AY" + r0).Value = [arr5];
      ctx.stat("bulkWrite");
    } catch (e) {
      for (var c2 in vals) { if (vals.hasOwnProperty(c2)) { try { ctx.DB.Cells(r0, parseInt(c2, 10)).Value = vals[c2]; ctx.stat("cellWrite"); } catch (e2) {} } }
    }
    // 同步内存 grid，保证后续读一致
    if (ctx.dbGrid && ctx.dbGrid[r0 - 3]) {
      for (var c3 = 47; c3 <= 51; c3++) ctx.dbGrid[r0 - 3][c3 - 1] = arr5[c3 - 47];
    }
    // 员工ID列文本格式
    if (vals[DB_ID] !== undefined) {
      try { ctx.DB.Range("AW" + r0).NumberFormat = "@"; } catch (e3) {}
    }
  }
  ctx._dbWrites = null;
}

// =====================================================================
// 数据检查（含派生表公式定位：必须报告表名/单元格/公式内容）
// =====================================================================
function _V32_CheckData(ctx) {
  var issues = [];
  var rows = ctx.dbCache.rows;
  var dupRows = ctx.idAlloc.dupRows;

  // 1) 数据库侧
  var idRows = {};
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i];
    if (d.blank) continue;
    if (d.name === "") issues.push("行" + d.r + "：姓名为空（有状态/id但无姓名）");
    if (d.id === "") issues.push("行" + d.r + " " + d.name + "：员工ID为空");
    else { if (!idRows[d.id]) idRows[d.id] = []; idRows[d.id].push(d.r); }
    if (d.status === "") { if (d.id !== "" || d.name !== "") issues.push("行" + d.r + " " + d.name + "：员工状态为空"); }
    else if (!_V32_IsValidStatus(d.status)) issues.push("行" + d.r + " " + d.name + "：非法状态『" + d.status + "』");
    if (d.status !== "" && d.av !== "" && d.status !== d.av) issues.push(d.id + " " + d.name + "：同步状态(" + d.av + ") ≠ 员工状态(" + d.status + ")，待同步");
  }
  for (var iid in idRows) {
    if (!idRows.hasOwnProperty(iid)) continue;
    if (idRows[iid].length > 1) issues.push("★ 员工ID重复：" + iid + " 出现在数据库 " + idRows[iid].length + " 行（行 " + idRows[iid].join("、") + "）→ 全量校准将停止对该ID的自动校准，请人工处理");
  }
  // 1b) 员工ID 显示格式检查
  var needFix = 0;
  for (var j2 = 0; j2 < rows.length; j2++) {
    var iv = rows[j2].id;
    if (iv === "") continue;
    if (iv.indexOf("E+") >= 0 || iv.indexOf("e+") >= 0 || /^\d+(\.\d+)?$/.test(iv)) needFix++;
  }
  if (needFix > 0) issues.push("员工ID列有 " + needFix + " 个单元格疑似被识别为数字/科学计数法，运行同步会自动转为文本格式");

  // 2) 派生表侧：孤儿/重复ID + ★ 公式定位报告
  var totalFormula = 0;
  for (var ti = 0; ti < ctx.tables.length; ti++) {
    var t = ctx.tables[ti];
    var info = ctx.tctx[t.name];
    var seen = {}, fCells = [];
    for (var r2 = 0; r2 < info.grid.length; r2++) {
      var id2 = _V32_Text(_V32_G(info.grid, r2, t.idCol));
      var nm2 = _V32_Text(_V32_G(info.grid, r2, t.nameCol));
      if (nm2 === "" && id2 === "") continue;
      if (id2 !== "") {
        if (seen[id2] !== undefined) issues.push(t.name + "：" + id2 + " 重复出现（行" + (seen[id2] + t.start) + " 与 行" + (r2 + t.start) + "）");
        else seen[id2] = r2;
        if (!idRows[id2]) issues.push(t.name + " 行" + (r2 + t.start) + "：" + id2 + " 在数据库中不存在（孤儿记录）");
      }
      for (var c2 = 1; c2 <= t.idCol; c2++) {
        var f2 = _V32_G(info.grid, r2, c2);
        if (typeof f2 === "string" && f2.length > 0 && f2.charAt(0) === "=") {
          totalFormula++;
          if (fCells.length < 20) fCells.push("工作表=" + t.name + " 单元格=" + _V32_ColLetter(c2) + (r2 + t.start) + " 公式=" + f2.substring(0, 60));
        }
      }
    }
    if (fCells.length > 0) {
      issues.push("★ 派生表仍存在公式：" + t.name + "（本表共 " + info.formulaCount + " 个）");
      for (var fc = 0; fc < fCells.length; fc++) issues.push("    " + fCells[fc]);
    }
  }

  var msg = "【数据检查】共发现 " + issues.length + " 个问题\n";
  msg += "派生表公式总数：" + totalFormula + "（运行【同步员工状态】会自动转为固定值）\n\n";
  if (issues.length === 0) msg += "✅ 未发现问题，数据一致，派生表无公式。";
  else {
    for (var k = 0; k < issues.length && k < 60; k++) msg += (k + 1) + ". " + issues[k] + "\n";
    if (issues.length > 60) msg += "…（共 " + issues.length + " 个，仅显示前 60 个）";
  }
  // 附加性能统计
  msg += "\n\n[本次读表] 整块读 " + ctx.stats.bulkRead + " 次，逐格读 " + ctx.stats.cellRead + " 次";
  alert(msg);
}

// =====================================================================
// 日志（严格保持 10 列结构，G=目标工作表，H=操作类型）
// =====================================================================
function _V32_PushLog(log, row, id, name, oldS, newS, sheet, op, result, err) {
  log.push({ t: _V32_Now(), row: row, id: id, name: name, old: oldS, neu: newS, act: sheet, op: op || "", res: result, err: err || "" });
}
function _V32_WriteLog(ctx, log) {
  if (!log || log.length === 0) return;
  var wb = ctx.wb;
  var ws = null;
  try { ws = wb.Sheets("同步日志"); } catch (e) { ws = null; }
  if (ws == null) {
    try { ws = wb.Sheets.Add(null, wb.Sheets(wb.Sheets.Count)); ws.Name = "同步日志"; } catch (e2) { return; }
    var hdr = ["时间", "数据库行", "员工ID", "姓名", "原状态", "新状态", "目标工作表", "操作类型", "结果", "错误信息"];
    for (var h = 0; h < hdr.length; h++) ws.Cells(1, h + 1).Value = hdr[h];
  }
  var last = 1;
  try { last = ws.Cells(ws.Rows.Count, 1).End(-4162).Row; } catch (e4) { last = 1; }
  if (last < 1) last = 1;
  // ★ 一次性批量写日志（1 次 WPS 调用）
  var grid = [];
  for (var i = 0; i < log.length; i++) {
    var L = log[i];
    grid.push([L.t, L.row, L.id, L.name, L.old, L.neu, L.act, L.op, L.res, L.err]);
  }
  _V32_BulkWrite(ws, last + 1, 1, grid);
  ctx.stat("bulkWrite");
}
function _V32_ShowLog() {
  var wb = ThisWorkbook;
  var ws = null;
  try { ws = wb.Sheets("同步日志"); } catch (e) { ws = null; }
  if (ws == null) { alert("暂无同步日志表。请先运行一次【同步员工状态】或【全量校准】。"); return; }
  var last = 1;
  try { last = ws.Cells(ws.Rows.Count, 1).End(-4162).Row; } catch (e4) { last = 1; }
  if (last <= 1) { alert("同步日志为空。"); return; }
  var start = Math.max(2, last - 29);
  var rd = _V32_BulkRead(ws, start, 1, last, 10);
  var msg = "【同步日志】最近记录（最新在下方）\n共 " + (last - 1) + " 条\n\n";
  for (var i = 0; i < rd.rows; i++) {
    var g = rd.data[i];
    msg += _V32_Text(g[0]) + " 行" + _V32_Text(g[1]) + " " + _V32_Text(g[2]) + " " + _V32_Text(g[3]) +
           " " + _V32_Text(g[4]) + "→" + _V32_Text(g[5]) +
           " [" + _V32_Text(g[6]) + " " + _V32_Text(g[7]) + "] " + _V32_Text(g[8]) +
           (_V32_Text(g[9]) ? (" (" + _V32_Text(g[9]) + ")") : "") + "\n";
  }
  alert(msg);
}

// =====================================================================
// 结果报告
// =====================================================================
function _V32_Report(ctx, r, log, isFull, conv, wrote) {
  var title = isFull ? "【全量校准】完成" : "【同步员工状态】完成";
  var msg = title + "\n" +
    "──────────────────\n" +
    "扫描员工：" + r.scan + " 人\n" +
    "成功同步：" + r.synced + " 人\n" +
    "新增行：" + r.added + " 条\n" +
    "更新行：" + r.updated + " 条\n" +
    "移除行：" + r.removed + " 条\n" +
    "自动生成员工ID：" + r.idGen + " 个\n" +
    "公式转固定值：" + (conv || 0) + " 个\n" +
    "失败：" + r.failed + " 人\n";
  if (log && log.length > 0) msg += "本次日志记录：" + log.length + " 条（已写入『同步日志』表）\n";
  msg += "\n[性能] 整块读 " + ctx.stats.bulkRead + " 次 / 整块写 " + ctx.stats.bulkWrite +
         " 次 / 逐格读 " + ctx.stats.cellRead + " 次 / 逐格写 " + ctx.stats.cellWrite + " 次\n";
  if (r.errors && r.errors.length > 0) {
    msg += "\n⚠ 异常明细：\n";
    for (var i = 0; i < r.errors.length && i < 25; i++) msg += "  " + (i + 1) + ". " + r.errors[i] + "\n";
    if (r.errors.length > 25) msg += "  …（共 " + r.errors.length + " 条，详见『同步日志』）";
  } else {
    msg += "\n✅ 无异常。";
  }
  alert(msg);
}
