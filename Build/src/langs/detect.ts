const HIRAGANA = /[\u3040-\u309f]/g;
const KATAKANA = /[\u30a0-\u30ff]/g;
const HAN = /[\u4e00-\u9fff]/g;
const LATIN = /[A-Za-z]/g;
const LATIN_WORD = /[a-z]+/g;

const ROMAJI_SYLLABLES = new Set([
  "a", "i", "u", "e", "o",
  "ka", "ki", "ku", "ke", "ko", "ga", "gi", "gu", "ge", "go",
  "sa", "shi", "su", "se", "so", "za", "ji", "zu", "ze", "zo",
  "ta", "chi", "tsu", "te", "to", "da", "di", "du", "de", "do",
  "na", "ni", "nu", "ne", "no", "nya", "nyu", "nyo",
  "ha", "hi", "fu", "he", "ho", "ba", "bi", "bu", "be", "bo",
  "pa", "pi", "pu", "pe", "po", "ma", "mi", "mu", "me", "mo",
  "ya", "yu", "yo", "ye", "ra", "ri", "ru", "re", "ro", "wa", "wo", "n",
  "kya", "kyu", "kyo", "gya", "gyu", "gyo", "sha", "shu", "sho",
  "ja", "ju", "jo", "cha", "chu", "cho", "hya", "hyu", "hyo",
  "bya", "byu", "byo", "pya", "pyu", "pyo", "mya", "myu", "myo",
  "rya", "ryu", "ryo",
]);

const ROMAJI_MARKERS = new Set([
  "shi", "chi", "tsu", "fu", "ji", "ja", "ju", "jo",
  "kya", "kyu", "kyo", "gya", "gyu", "gyo", "sha", "shu", "sho",
  "cha", "chu", "cho", "nya", "nyu", "nyo", "hya", "hyu", "hyo",
  "bya", "byu", "byo", "pya", "pyu", "pyo", "mya", "myu", "myo",
  "rya", "ryu", "ryo",
]);

const PINYIN_SYLLABLE_SOURCE = `
a ai an ang ao
ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou
chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo
da dai dan dang dao de dei deng di dia dian diao die ding diu dong dou
du duan dui dun duo
e ei en eng er
fa fan fang fei fen feng fo fou fu
ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo
la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou
lu luan lun luo lv lve
ma mai man mang mao mei men meng mi mian miao mie min ming miu mo mou mu
na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong
nu nuan nun nuo nv nve
ou
pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou
shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo
ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
wa wai wan wang wei wen weng wo wu
xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun
za ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou
zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo
`;
const PINYIN_SYLLABLES = new Set(PINYIN_SYLLABLE_SOURCE.trim().split(/\s+/));

const MAX_SYLLABLE_LENGTH = 6;

/** Minimum fraction of Latin tokens that must fit a romanization to score it. */
export const ROMANIZATION_THRESHOLD = 0.6;

/** Script composition of a set of lyrics, counting each script's characters. */
export interface ScriptCounts {
  kana: number;
  han: number;
  latin: number;
  total: number;
}

/** Count the kana, Han, and Latin characters across a sequence of lyrics.
 * 
 *  @param lyrics Lyric strings from the notes being classified.
 *  @returns Per-script character counts and their sum.
 */
export function countScripts(lyrics: readonly string[]): ScriptCounts {
  let kana = 0;
  let han = 0;
  let latin = 0;
  for (const lyric of lyrics) {
    kana += (lyric.match(HIRAGANA)?.length ?? 0) + (lyric.match(KATAKANA)?.length ?? 0);
    han += lyric.match(HAN)?.length ?? 0;
    latin += lyric.match(LATIN)?.length ?? 0;
  }
  return { kana, han, latin, total: kana + han + latin };
}

interface Segmentation {
  count: number;
  segments: string[];
}

/** Fewest inventory syllables covering a Latin token, with the chosen syllables.
 *
 *  Doubled letters collapse first so sokuon (`kk`) and long vowels (`ou`) do not
 *  need separate inventory entries. Ties prefer the longer final syllable, which
 *  keeps segmentations such as `shi` rather than `s` + `hi`.
 */
function segmentToken(token: string, syllables: ReadonlySet<string>): Segmentation | null {
  const normalized = token.replace(/(.)\1/g, "$1");
  const best: (Segmentation | null)[] = Array.from({ length: normalized.length + 1 }, () => null);
  best[0] = { count: 0, segments: [] };

  for (let i = 0; i < normalized.length; i++) {
    const current = best[i];
    if (!current) continue;
    const maxLength = Math.min(MAX_SYLLABLE_LENGTH, normalized.length - i);
    for (let len = maxLength; len >= 1; len--) {
      const part = normalized.slice(i, i + len);
      if (!syllables.has(part)) continue;
      const next = best[i + len];
      const count = current.count + 1;
      if (!next || count < next.count || (count === next.count && len > (next.segments.at(-1)?.length ?? 0))) {
        best[i + len] = { count, segments: [...current.segments, part] };
      }
    }
  }
  return best[normalized.length] ?? null;
}

/** How strongly Latin-script lyrics fit romaji and pinyin syllable patterns. */
export interface RomanizationStats {
  romajiRatio: number;
  pinyinRatio: number;
  romajiSegments: number;
  pinyinSegments: number;
  romajiExclusive: number;
  pinyinExclusive: number;
  romajiMarkers: number;
  latinTokens: number;
}

/** Score Latin lyric tokens against romaji and pinyin syllable inventories.
 *
 *  Exclusive syllables and characteristic romaji spellings break ties between
 *  the two romanizations: `ni hao` is pinyin, while `shi chi tsu` is romaji.
 *  Segment counts settle cases where every syllable is shared, such as
 *  `wo ai ni`, where pinyin uses one syllable per note and romaji splits `ai`.
 *
 *  @param lyrics Lyric strings from the notes being classified.
 *  @returns Match ratios, segment counts, and discriminating syllable counts.
 */
export function romanizationStats(lyrics: readonly string[]): RomanizationStats {
  const tokens = lyrics.flatMap((lyric) => lyric.toLowerCase().match(LATIN_WORD) ?? []);
  let romaji = 0;
  let pinyin = 0;
  let romajiSegments = 0;
  let pinyinSegments = 0;
  let romajiExclusive = 0;
  let pinyinExclusive = 0;
  let romajiMarkers = 0;

  for (const token of tokens) {
    const r = segmentToken(token, ROMAJI_SYLLABLES);
    const p = segmentToken(token, PINYIN_SYLLABLES);
    if (r) {
      romaji++;
      romajiSegments += r.count;
      for (const segment of r.segments) {
        if (!PINYIN_SYLLABLES.has(segment)) romajiExclusive++;
        if (ROMAJI_MARKERS.has(segment)) romajiMarkers++;
      }
    }
    if (p) {
      pinyin++;
      pinyinSegments += p.count;
      for (const segment of p.segments) {
        if (!ROMAJI_SYLLABLES.has(segment)) pinyinExclusive++;
      }
    }
    if (/(.)\1/.test(token)) romajiMarkers++;
  }

  const count = tokens.length;
  return {
    romajiRatio: count > 0 ? romaji / count : 0,
    pinyinRatio: count > 0 ? pinyin / count : 0,
    romajiSegments,
    pinyinSegments,
    romajiExclusive,
    pinyinExclusive,
    romajiMarkers,
    latinTokens: count,
  };
}
