/** Normalisers for dict_words. Apply them to a query string before searching searchKeys. */
const SINGLE = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'bu' };
const DIGRAPH = { きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho', ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo', ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo', りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo', じゃ: 'ja', じゅ: 'ju', じょ: 'jo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo', てぃ: 'ti', でぃ: 'di', ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', うぃ: 'wi', うぇ: 'we', うぉ: 'wo', しぇ: 'she', ちぇ: 'che', じぇ: 'je', つぁ: 'tsa' };

const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

function kanaToRomaji(kana) {
  const s = toHiragana(kana);
  let out = '';
  let sokuon = false;
  let last = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === 'っ') {
      sokuon = true;
    } else if (c === 'ー') {
      out += last;
    } else {
      const two = DIGRAPH[s.slice(i, i + 2)];
      const syllable = two || SINGLE[c];
      if (two) i += 1;
      if (syllable) {
        const piece = sokuon ? (syllable.startsWith('ch') ? 'c' : syllable[0]) + syllable : syllable;
        sokuon = false;
        out += piece;
        last = piece[piece.length - 1];
      }
    }
  }
  return out;
}

/** Collapses romaji style differences, so byoin, byōin and byouin give one key. */
const romajiKey = (s) => s.normalize('NFC').toLowerCase()
  .replace(/[āâ]/g, 'a').replace(/[īî]/g, 'i').replace(/[ūû]/g, 'u').replace(/[ēê]/g, 'e').replace(/[ōô]/g, 'o')
  .replace(/[^a-z]/g, '').replace(/wo/g, 'o').replace(/du/g, 'zu').replace(/tch/g, 'cch')
  .replace(/ou|oo/g, 'o').replace(/uu/g, 'u').replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/ee|ei/g, 'e')
  .replace(/([aiueo])\1+/g, '$1').replace(/m(?=[bpm])/g, 'n');

module.exports = { toHiragana, kanaToRomaji, romajiKey };
