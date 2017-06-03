
/* riot-tmpl WIP, @license MIT, (c) 2015 Muut Inc. + contributors */
;(function (window) {     // eslint-disable-line no-extra-semi
  'use strict'
  /**
   * riot.util.brackets
   *
   * - `brackets    ` - Returns a string or regex based on its parameter
   * - `brackets.set` - Change the current riot brackets
   *
   * @module
   */

  var brackets = (function (UNDEF) {

    var skipRegex = (function () {

      var beforeReChars = '[{(,;:?=|&!^~>%*/'

      var beforeReWords = [
        'case',
        'default',
        'do',
        'else',
        'in',
        'instanceof',
        'prefix',
        'return',
        'typeof',
        'void',
        'yield'
      ]

      var RE_REGEX = /^\/(?=[^*>/])[^[/\\]*(?:\\.|(?:\[(?:\\.|[^\]\\]*)*\])[^[\\/]*)*?\/(?=[gimuy]+|[^/\*]|$)/
      var RE_VARCHAR = /[$\w]/

      function prev (code, pos) {
        while (--pos >= 0 && /\s/.test(code[pos]));
        return pos
      }

      function _skipRegex (code, start) {

        var re = /.*/g
        var pos = re.lastIndex = start - 1
        var match = re.exec(code)[0].match(RE_REGEX)

        if (match) {
          var next = pos + match[0].length

          pos = prev(code, pos)
          var c = code[pos]

          if (pos < 0 || ~beforeReChars.indexOf(c)) {
            return next
          }

          // istanbul ignore next: This is for ES6
          if (c === '.') {

            if (code[pos - 1] === '.') {
              start = next
            }

          } else if (c === '+' || c === '-') {

            if (code[--pos] !== c ||
                (pos = prev(code, pos)) < 0 ||
                !RE_VARCHAR.test(code[pos])) {
              start = next
            }

          } else if (/[a-z]/.test(c)) {

            ++pos
            for (var i = 0; i < beforeReWords.length; i++) {
              var kw = beforeReWords[i]
              var nn = pos - kw.length

              if (nn >= 0 && code.slice(nn, pos) === kw && !RE_VARCHAR.test(code[nn - 1])) {
                start = next
                break
              }
            }
          }
        }

        return start
      }

      return _skipRegex

    })()

    var
      REGLOB = 'g',

      R_MLCOMMS = /\/\*[^*]*\*+(?:[^*\/][^*]*\*+)*\//g,

      R_STRINGS = /"[^"\\]*(?:\\[\S\s][^"\\]*)*"|'[^'\\]*(?:\\[\S\s][^'\\]*)*'/g,

      S_QBLOCKS = R_STRINGS.source + '|' +
        /(?:\breturn\s+|(?:[$\w\)\]]|\+\+|--)\s*(\/)(?![*\/]))/.source + '|' +
        /\/(?=[^*\/])[^[\/\\]*(?:(?:\[(?:\\.|[^\]\\]*)*\]|\\.)[^[\/\\]*)*?(\/)[gim]*/.source,

      UNSUPPORTED = RegExp('[\\' + 'x00-\\x1F<>a-zA-Z0-9\'",;\\\\]'),

      NEED_ESCAPE = /(?=[[\]()*+?.^$|])/g,

      FINDBRACES = {
        '(': RegExp('([()])|'   + S_QBLOCKS, REGLOB),
        '[': RegExp('([[\\]])|' + S_QBLOCKS, REGLOB),
        '{': RegExp('([{}])|'   + S_QBLOCKS, REGLOB)
      },

      DEFAULT = '{ }'

    var _pairs = [
      '{', '}',
      '{', '}',
      /{[^}]*}/,
      /\\([{}])/g,
      /\\({)|{/g,
      RegExp('\\\\(})|([[({])|(})|' + S_QBLOCKS, REGLOB),
      DEFAULT,
      /^\s*{\^?\s*([$\w]+)(?:\s*,\s*(\S+))?\s+in\s+(\S.*)\s*}/,
      /(^|[^\\]){=[\S\s]*?}/
    ]

    var
      cachedBrackets = UNDEF,
      _regex,
      _cache = [],
      _settings

    function _loopback (re) { return re }

    function _rewrite (re, bp) {
      if (!bp) bp = _cache
      return new RegExp(
        re.source.replace(/{/g, bp[2]).replace(/}/g, bp[3]), re.global ? REGLOB : ''
      )
    }

    function _create (pair) {
      if (pair === DEFAULT) return _pairs

      var arr = pair.split(' ')

      if (arr.length !== 2 || UNSUPPORTED.test(pair)) {
        throw new Error('Unsupported brackets "' + pair + '"')
      }
      arr = arr.concat(pair.replace(NEED_ESCAPE, '\\').split(' '))

      arr[4] = _rewrite(arr[1].length > 1 ? /{[\S\s]*?}/ : _pairs[4], arr)
      arr[5] = _rewrite(pair.length > 3 ? /\\({|})/g : _pairs[5], arr)
      arr[6] = _rewrite(_pairs[6], arr)
      arr[7] = RegExp('\\\\(' + arr[3] + ')|([[({])|(' + arr[3] + ')|' + S_QBLOCKS, REGLOB)
      arr[8] = pair
      return arr
    }

    function _brackets (reOrIdx) {
      return reOrIdx instanceof RegExp ? _regex(reOrIdx) : _cache[reOrIdx]
    }

    _brackets.split = function split (str, tmpl, _bp) {
      // istanbul ignore next: _bp is for the compiler
      if (!_bp) _bp = _cache

      var
        parts = [],
        match,
        isexpr,
        start,
        pos,
        re = _bp[6]

      isexpr = start = re.lastIndex = 0

      while ((match = re.exec(str))) {

        pos = match.index

        if (isexpr) {

          if (match[2]) {
            re.lastIndex = skipBraces(str, match[2], re.lastIndex)
            continue
          }
          if (!match[3]) {
            if (match[5]) {

              re.lastIndex = skipRegex(str, match.index + 1)
            }
            continue
          }
        }

        if (!match[1]) {
          unescapeStr(str.slice(start, pos))
          start = re.lastIndex
          re = _bp[6 + (isexpr ^= 1)]
          re.lastIndex = start
        }
      }

      if (str && start < str.length) {
        unescapeStr(str.slice(start))
      }

      return parts

      function unescapeStr (s) {
        if (tmpl || isexpr) {
          parts.push(s && s.replace(_bp[5], '$1'))
        } else {
          parts.push(s)
        }
      }

      function skipBraces (s, ch, ix) {
        var
          match,
          recch = FINDBRACES[ch]

        recch.lastIndex = ix
        ix = 1
        while ((match = recch.exec(s))) {
          if (match[1] &&
            !(match[1] === ch ? ++ix : --ix)) break
        }
        return ix ? s.length : recch.lastIndex
      }
    }

    _brackets.hasExpr = function hasExpr (str) {
      return _cache[4].test(str)
    }

    _brackets.loopKeys = function loopKeys (expr) {
      var m = expr.match(_cache[9])

      return m
        ? { key: m[1], pos: m[2], val: _cache[0] + m[3].trim() + _cache[1] }
        : { val: expr.trim() }
    }

    _brackets.array = function array (pair) {
      return pair ? _create(pair) : _cache
    }

    function _reset (pair) {
      if ((pair || (pair = DEFAULT)) !== _cache[8]) {
        _cache = _create(pair)
        _regex = pair === DEFAULT ? _loopback : _rewrite
        _cache[9] = _regex(_pairs[9])
      }
      cachedBrackets = pair
    }

    function _setSettings (o) {
      var b

      o = o || {}
      b = o.brackets
      Object.defineProperty(o, 'brackets', {
        set: _reset,
        get: function () { return cachedBrackets },
        enumerable: true
      })
      _settings = o
      _reset(b)
    }

    Object.defineProperty(_brackets, 'settings', {
      set: _setSettings,
      get: function () { return _settings }
    })

    /* istanbul ignore next: in the browser riot is always in the scope */
    _brackets.settings = typeof riot !== 'undefined' && riot.settings || {}
    _brackets.set = _reset

    _brackets.R_STRINGS = R_STRINGS
    _brackets.R_MLCOMMS = R_MLCOMMS
    _brackets.S_QBLOCKS = S_QBLOCKS

    return _brackets

  })()

  /**
   * @module tmpl
   *
   * tmpl          - Root function, returns the template value, render with data
   * tmpl.hasExpr  - Test the existence of a expression inside a string
   * tmpl.loopKeys - Get the keys for an 'each' loop (used by `_each`)
   */

  var tmpl = (function () {

    var _cache = {}

    function _tmpl (str, data) {
      if (!str) return str

      return (_cache[str] || (_cache[str] = _create(str))).call(data, _logErr)
    }

    _tmpl.hasExpr = brackets.hasExpr

    _tmpl.loopKeys = brackets.loopKeys

    // istanbul ignore next
    _tmpl.clearCache = function () { _cache = {} }

    _tmpl.errorHandler = null

    function _logErr (err, ctx) {

      err.riotData = {
        tagName: ctx && ctx.__ && ctx.__.tagName,
        _riot_id: ctx && ctx._riot_id  //eslint-disable-line camelcase
      }

      if (_tmpl.errorHandler) _tmpl.errorHandler(err)
      else if (
        typeof console !== 'undefined' &&
        typeof console.error === 'function'
      ) {
        if (err.riotData.tagName) {
          // istanbul ignore next
          console.error('Riot template error thrown in the <%s> tag', err.riotData.tagName)
        }
        console.error(err)
      }
    }

    function _create (str) {
      var expr = _getTmpl(str)

      if (expr.slice(0, 11) !== 'try{return ') expr = 'return ' + expr

      return new Function('E', expr + ';')    // eslint-disable-line no-new-func
    }

    var
      CH_IDEXPR = String.fromCharCode(0x2057),
      RE_CSNAME = /^(?:(-?[_A-Za-z\xA0-\xFF][-\w\xA0-\xFF]*)|\u2057(\d+)~):/,
      RE_QBLOCK = RegExp(brackets.S_QBLOCKS, 'g'),
      RE_DQUOTE = /\u2057/g,
      RE_QBMARK = /\u2057(\d+)~/g

    function _getTmpl (str) {
      var
        qstr = [],
        expr,
        parts = brackets.split(str.replace(RE_DQUOTE, '"'), 1)

      if (parts.length > 2 || parts[0]) {
        var i, j, list = []

        for (i = j = 0; i < parts.length; ++i) {

          expr = parts[i]

          if (expr && (expr = i & 1

              ? _parseExpr(expr, 1, qstr)

              : '"' + expr
                  .replace(/\\/g, '\\\\')
                  .replace(/\r\n?|\n/g, '\\n')
                  .replace(/"/g, '\\"') +
                '"'

            )) list[j++] = expr

        }

        expr = j < 2 ? list[0]
             : '[' + list.join(',') + '].join("")'

      } else {

        expr = _parseExpr(parts[1], 0, qstr)
      }

      if (qstr[0]) {
        expr = expr.replace(RE_QBMARK, function (_, pos) {
          return qstr[pos]
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
        })
      }
      return expr
    }

    var
      RE_BREND = {
        '(': /[()]/g,
        '[': /[[\]]/g,
        '{': /[{}]/g
      }

    function _parseExpr (expr, asText, qstr) {

      expr = expr
            .replace(RE_QBLOCK, function (s, div) {
              return s.length > 2 && !div ? CH_IDEXPR + (qstr.push(s) - 1) + '~' : s
            })
            .replace(/\s+/g, ' ').trim()
            .replace(/\ ?([[\({},?\.:])\ ?/g, '$1')

      if (expr) {
        var
          list = [],
          cnt = 0,
          match

        while (expr &&
              (match = expr.match(RE_CSNAME)) &&
              !match.index
          ) {
          var
            key,
            jsb,
            re = /,|([[{(])|$/g

          expr = RegExp.rightContext
          key  = match[2] ? qstr[match[2]].slice(1, -1).trim().replace(/\s+/g, ' ') : match[1]

          while (jsb = (match = re.exec(expr))[1]) skipBraces(jsb, re)

          jsb  = expr.slice(0, match.index)
          expr = RegExp.rightContext

          list[cnt++] = _wrapExpr(jsb, 1, key)
        }

        expr = !cnt ? _wrapExpr(expr, asText)
             : cnt > 1 ? '[' + list.join(',') + '].join(" ").trim()' : list[0]
      }
      return expr

      function skipBraces (ch, re) {
        var
          mm,
          lv = 1,
          ir = RE_BREND[ch]

        ir.lastIndex = re.lastIndex
        while (mm = ir.exec(expr)) {
          if (mm[0] === ch) ++lv
          else if (!--lv) break
        }
        re.lastIndex = lv ? expr.length : ir.lastIndex
      }
    }

    // istanbul ignore next: not both
    var // eslint-disable-next-line max-len
      JS_CONTEXT = '"in this?this:' + (typeof window !== 'object' ? 'global' : 'window') + ').',
      JS_VARNAME = /[,{][\$\w]+(?=:)|(^ *|[^$\w\.{])(?!(?:typeof|true|false|null|undefined|in|instanceof|is(?:Finite|NaN)|void|NaN|new|Date|RegExp|Math)(?![$\w]))([$_A-Za-z][$\w]*)/g,
      JS_NOPROPS = /^(?=(\.[$\w]+))\1(?:[^.[(]|$)/

    function _wrapExpr (expr, asText, key) {
      var tb

      expr = expr.replace(JS_VARNAME, function (match, p, mvar, pos, s) {
        if (mvar) {
          pos = tb ? 0 : pos + match.length

          if (mvar !== 'this' && mvar !== 'global' && mvar !== 'window') {
            match = p + '("' + mvar + JS_CONTEXT + mvar
            if (pos) tb = (s = s[pos]) === '.' || s === '(' || s === '['
          } else if (pos) {
            tb = !JS_NOPROPS.test(s.slice(pos))
          }
        }
        return match
      })

      if (tb) {
        expr = 'try{return ' + expr + '}catch(e){E(e,this)}'
      }

      if (key) {

        expr = (tb
            ? 'function(){' + expr + '}.call(this)' : '(' + expr + ')'
          ) + '?"' + key + '":""'

      } else if (asText) {

        expr = 'function(v){' + (tb
            ? expr.replace('return ', 'v=') : 'v=(' + expr + ')'
          ) + ';return v||v===0?v:""}.call(this)'
      }

      return expr
    }

    return _tmpl

  })()

  tmpl.version = brackets.version = 'WIP'

  /* istanbul ignore else */
  if (typeof module === 'object' && module.exports) {
    module.exports = {
      tmpl: tmpl, brackets: brackets
    }
  } else if (typeof define === 'function' && typeof define.amd !== 'undefined') {
    define(function () {
      return {
        tmpl: tmpl, brackets: brackets
      }
    })
  } else if (window) {
    window.tmpl = tmpl
    window.brackets = brackets
  }

})(typeof window === 'object' ? /* istanbul ignore next */ window : void 0)
