/**
 * Seeds ShippingRate rows for major towns across all 47 Kenyan counties.
 * Idempotent: only creates missing towns, never overwrites a rate the
 * admin has already customized. Run again any time to add newly-added
 * towns from this list without disturbing existing prices.
 *
 * Usage: npm run seed:towns
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const DEFAULT_RATE_KES = 500

// Major towns per county — not exhaustive (every trading centre in Kenya
// would be thousands of entries), but covers real delivery destinations.
const TOWNS_BY_COUNTY: Record<string, string[]> = {
  Nairobi: ['Nairobi CBD', 'Westlands', 'Karen', 'Kasarani', 'Embakasi', "Lang'ata", 'Eastleigh', 'South B/C'],
  Mombasa: ['Mombasa', 'Nyali', 'Bamburi', 'Likoni'],
  Kwale: ['Kwale', 'Ukunda', 'Diani', 'Msambweni'],
  Kilifi: ['Kilifi', 'Malindi', 'Watamu', 'Mtwapa'],
  'Tana River': ['Hola', 'Garsen', 'Bura'],
  Lamu: ['Lamu', 'Mokowe', 'Faza'],
  'Taita-Taveta': ['Voi', 'Taveta', 'Wundanyi', 'Mwatate'],
  Garissa: ['Garissa', 'Dadaab', 'Masalani'],
  Wajir: ['Wajir', 'Habaswein'],
  Mandera: ['Mandera', 'El Wak', 'Rhamu'],
  Marsabit: ['Marsabit', 'Moyale', 'North Horr'],
  Isiolo: ['Isiolo', 'Merti'],
  Meru: ['Meru', 'Nkubu', 'Maua', 'Timau'],
  'Tharaka-Nithi': ['Chuka', 'Marimanti', 'Chogoria'],
  Embu: ['Embu', 'Runyenjes', 'Siakago'],
  Kitui: ['Kitui', 'Mwingi', 'Mutomo'],
  Machakos: ['Machakos', 'Athi River', 'Kangundo', 'Mwala'],
  Makueni: ['Wote', 'Emali', 'Kibwezi', 'Mtito Andei'],
  Nyandarua: ['Ol Kalou', 'Nyahururu', 'Engineer', 'Ol Joro Orok'],
  Nyeri: ['Nyeri', 'Karatina', 'Othaya', 'Mukurweini'],
  Kirinyaga: ['Kerugoya', 'Kutus', 'Sagana'],
  "Murang'a": ["Murang'a", 'Kenol', 'Kangema', 'Kandara'],
  Kiambu: ['Kiambu', 'Thika', 'Ruiru', 'Limuru', 'Kikuyu', 'Juja'],
  Turkana: ['Lodwar', 'Lokichogio', 'Kakuma'],
  'West Pokot': ['Kapenguria', 'Makutano', 'Chepareria'],
  Samburu: ['Maralal', 'Baragoi'],
  'Trans Nzoia': ['Kitale', 'Endebess', 'Kiminini'],
  'Uasin Gishu': ['Eldoret', 'Turbo', 'Moiben'],
  'Elgeyo-Marakwet': ['Iten', 'Kapsowar', 'Chebiemit'],
  Nandi: ['Kapsabet', 'Nandi Hills', 'Mosoriot'],
  Baringo: ['Kabarnet', 'Eldama Ravine', 'Marigat'],
  Laikipia: ['Nanyuki', 'Rumuruti'],
  Nakuru: ['Nakuru', 'Naivasha', 'Molo', 'Gilgil', 'Njoro'],
  Narok: ['Narok', 'Kilgoris', 'Ololulunga'],
  Kajiado: ['Kajiado', 'Kitengela', 'Ngong', 'Namanga'],
  Kericho: ['Kericho', 'Litein', 'Sosiot'],
  Bomet: ['Bomet', 'Sotik', 'Longisa'],
  Kakamega: ['Kakamega', 'Mumias', 'Butere', 'Malava'],
  Vihiga: ['Mbale', 'Luanda', 'Chavakali'],
  Bungoma: ['Bungoma', 'Webuye', 'Kimilili'],
  Busia: ['Busia', 'Malaba', 'Nambale'],
  Siaya: ['Siaya', 'Bondo', 'Ugunja'],
  Kisumu: ['Kisumu', 'Ahero', 'Muhoroni', 'Maseno'],
  'Homa Bay': ['Homa Bay', 'Mbita', 'Kendu Bay'],
  Migori: ['Migori', 'Awendo', 'Rongo', 'Isebania'],
  Kisii: ['Kisii', 'Ogembo', 'Suneka'],
  Nyamira: ['Nyamira', 'Keroka'],
}

async function main() {
  const allTowns = Object.values(TOWNS_BY_COUNTY).flat()
  console.log(`Seeding ${allTowns.length} towns across ${Object.keys(TOWNS_BY_COUNTY).length} counties…`)

  let created = 0
  let skipped = 0

  for (const town of allTowns) {
    const existing = await prisma.shippingRate.findUnique({ where: { town } })
    if (existing) {
      skipped++
      continue
    }
    await prisma.shippingRate.create({ data: { town, rateKes: DEFAULT_RATE_KES } })
    created++
  }

  await prisma.shippingRate.upsert({
    where: { town: 'DEFAULT' },
    update: {},
    create: { town: 'DEFAULT', rateKes: DEFAULT_RATE_KES },
  })

  console.log(`Done. Created ${created}, skipped ${skipped} (already existed).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
