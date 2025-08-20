// services/facebookAuth.js
const axios = require('axios');
const { prisma } = require('../config/database');

class FacebookAuthService {
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          redirect_uri: `${process.env.APP_URL}/api/auth/facebook/callback`,
          code: code
        }
      });
      
      return response.data.access_token;
    } catch (error) {
      throw new Error('Failed to exchange code for token');
    }
  }
  
  async getUserProfile(accessToken) {
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: {
          access_token: accessToken,
          fields: 'id,name,email,first_name,last_name,picture.type(large)'
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error('Failed to get user profile');
    }
  }
  
  async findOrCreateUser(profile) {
    try {
      let user = await prisma.user.findUnique({
        where: { facebookId: profile.id }
      });
      
      if (user) {
        return user;
      }
      
      // Check if user exists with same email
      if (profile.email) {
        user = await prisma.user.findUnique({
          where: { email: profile.email }
        });
        
        if (user) {
          // Link Facebook account
          user = await prisma.user.update({
            where: { id: user.id },
            data: { facebookId: profile.id }
          });
          return user;
        }
      }
      
      // Create new user
      user = await prisma.user.create({
        data: {
          email: profile.email || null,
          facebookId: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
          avatar: profile.picture?.data?.url,
          role: 'CUSTOMER',
          isEmailVerified: !!profile.email
        }
      });
      
      return user;
    } catch (error) {
      throw new Error('Failed to find or create user');
    }
  }
}

module.exports = new FacebookAuthService();