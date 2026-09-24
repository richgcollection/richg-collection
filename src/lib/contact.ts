export const CONTACT_EMAIL = 'richgcollection@gmail.com'
export const PHONE_DISPLAY = '+254 757 222 200'
export const PHONE_URL = 'tel:+254757222200'
export const WHATSAPP_DISPLAY = PHONE_DISPLAY
export const WHATSAPP_URL = 'https://wa.me/254757222200'

export const SOCIAL_LINKS = [
  { name: 'Instagram', handle: '@richg_collection', href: 'https://www.instagram.com/richg_collection/' },
  { name: 'Facebook', handle: 'Rich G Collection', href: 'https://web.facebook.com/profile.php?id=61553559158532' },
  { name: 'TikTok', handle: '@richgcollection', href: 'https://www.tiktok.com/@richgcollection/' },
] as const

export type SocialName = (typeof SOCIAL_LINKS)[number]['name']
