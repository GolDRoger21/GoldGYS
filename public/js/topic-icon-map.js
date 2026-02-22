export function pickTopicIcon(title = '', category, { isSubtopic = false } = {}) {
  const iconRules = [
    { match: /atatürk ilkeleri ve inkılap tarihi, ulusal güvenlik/i, icon: '🇹🇷' },
    { match: /1 sayılı cb|cumhurbaşkanlığı/i, icon: '☀️' },
    { match: /anayasa|anayasal/i, icon: '⚖️' },
    { match: /atatürk|inkılap|kurtuluş|mill[iî] mücadele/i, icon: '🇹🇷' },

    { match: /bakanlık teşkilatı|adalet bakanlığı/i, icon: '🏛️' },
    { match: /yargı örgütü|adliye/i, icon: '🏛️' },
    { match: /devlet teşkilatı|tbmm|meclis|yasama/i, icon: '🏛️' },
    { match: /belediye/i, icon: '🏙️' },
    { match: /özel idare|il idaresi|köy/i, icon: '🗺️' },
    { match: /idare|idari|kamu yönetimi|teşkilat|bakanlık/i, icon: '🏢' },

    { match: /yazı işleri|harçlar|kalem/i, icon: '🗃️' },
    { match: /segbis|elektronik imza|e-imza|uyap/i, icon: '💻' },
    { match: /yargı|mahkeme|hâkim|savcı|danıştay|sayıştay|uyuşmazlık/i, icon: '⚖️' },

    { match: /cmk|ceza muhakemesi|5271/i, icon: '📕' },
    { match: /infaz|5275|cezaevi|tevkifevi/i, icon: '⛓️' },
    { match: /hmk|hukuk muhakemeleri|6100/i, icon: '📗' },
    { match: /ceza|tck|suç|kovuşturma|soruşturma/i, icon: '🚨' },
    { match: /icra|iflas/i, icon: '📉' },

    { match: /657|memur|personel|kamu görevlileri/i, icon: '💼' },
    { match: /mal bildirim|yolsuzluk/i, icon: '📋' },
    { match: /etik|meslek ilkeleri/i, icon: '🧭' },
    { match: /disiplin/i, icon: '⚠️' },

    { match: /resm[iî] yazışma/i, icon: '🖋️' },
    { match: /halkla ilişkiler/i, icon: '👥' },
    { match: /tebligat|bildirim/i, icon: '📩' },
    { match: /bilgi edinme/i, icon: 'ℹ️' },
    { match: /dilekçe/i, icon: '✍️' },
    { match: /iletişim|tanıtım|medya|protokol/i, icon: '💬' },

    { match: /ulusal güvenlik|güvenlik|asayiş|jandarma|polis/i, icon: '🛡️' },
    { match: /insan hak|eşitlik|özgürlük/i, icon: '🕊️' },
    { match: /uluslararası|avrupa birliği|ab müktesebat/i, icon: '🌍' },

    { match: /medeni|aile|miras|eşya/i, icon: '👨‍👩‍👧' },
    { match: /borç/i, icon: '💸' },
    { match: /ticaret|şirket|sermaye|kıymetli evrak/i, icon: '📈' },
    { match: /iş hukuku|çalışma|sosyal güvenlik|sendika/i, icon: '👷' },

    { match: /vergi|mali|muhasebe|bütçe|finans|ekonomi/i, icon: '💰' },

    { match: /türkçe|dil bilgisi|imla|noktalama|paragraf|sözcük/i, icon: '🔤' },
    { match: /eğitim|öğretim|pedagoji/i, icon: '🎓' },
    { match: /teknoloji|bilişim|siber|veri|bilgisayar|internet/i, icon: '💻' },

    { match: /kanun|mevzuat|yönetmelik|genelge|tüzük|kararname|yönerge/i, icon: '📜' },
    { match: /sağlık|tıp/i, icon: '🩺' },
    { match: /çevre|imar|şehircilik|doğa/i, icon: '🌿' },
    { match: /tarih|çağdaş türk|osmanlı/i, icon: '⏳' },
    { match: /genel|temel/i, icon: '📌' }
  ];

  const matchedRule = iconRules.find((rule) => rule.match.test(title));
  if (matchedRule) return matchedRule.icon;
  if (isSubtopic) return '▫️';
  return category === 'alan' ? '📗' : '📘';
}
