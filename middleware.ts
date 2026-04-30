import {NextRequest, NextResponse} from 'next/server';
import {verifyToken} from '@/lib/auth';
import {getSessionCookie} from '@/lib/session';
import {routing} from '@/lib/i18n';

const publicRoutes = ['/login', '/portal', '/invite'];

export async function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl;

  // Check if the pathname starts with a locale
  const pathnameWithoutLocale = pathname.replace(/^\/(en|ar)(\/|$)/, '/');

  // Allow public routes
  if (publicRoutes.some((route) => pathnameWithoutLocale.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for session
  const token = await getSessionCookie();
  if (!token) {
    const locale = pathname.startsWith('/ar') ? 'ar' : 'en';
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  try {
    await verifyToken(token);
    return NextResponse.next();
  } catch {
    const locale = pathname.startsWith('/ar') ? 'ar' : 'en';
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
