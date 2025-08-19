// import passport from 'passport';
// import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
// import { prisma } from './database';

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID!,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
//       callbackURL: process.env.GOOGLE_CALLBACK_URL!,
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         // Check if user already exists with this Google ID
//         let user = await prisma.user.findFirst({
//           where: {
//             OR: [
//               { providerId: profile.id, provider: 'GOOGLE' },
//               { email: profile.emails?.[0]?.value }
//             ]
//           }
//         });

//         if (user) {
//           // Update existing user with Google info if not already set
//           if (user.provider === 'LOCAL') {
//             user = await prisma.user.update({
//               where: { id: user.id },
//               data: {
//                 provider: 'GOOGLE',
//                 providerId: profile.id,
//                 avatar: profile.photos?.[0]?.value,
//                 name: user.name || profile.displayName,
//               }
//             });
//           }
//           return done(null, user);
//         }

//         // Create new user
//         const newUser = await prisma.user.create({
//           data: {
//             email: profile.emails?.[0]?.value!,
//             name: profile.displayName,
//             provider: 'GOOGLE',
//             providerId: profile.id,
//             avatar: profile.photos?.[0]?.value,
//           }
//         });

//         return done(null, newUser);
//       } catch (error) {
//         return done(error, null);
//       }
//     }
//   )
// );

// passport.serializeUser((user: any, done) => {
//   done(null, user.id);
// });

// passport.deserializeUser(async (id: string, done) => {
//   try {
//     const user = await prisma.user.findUnique({
//       where: { id },
//       select: { id: true, email: true, name: true, role: true, avatar: true }
//     });
//     done(null, user);
//   } catch (error) {
//     done(error, null);
//   }
// });

// export default passport;