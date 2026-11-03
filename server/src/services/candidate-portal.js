import crypto from 'node:crypto';
import pool from '../db.js';
import { ApiError } from '../utils.js';
import { sendEmail, isSmtpConfigured } from './mailer.js';

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates a secure time-limited invitation token for a candidate.
 * Stores only sha256(token) in the database.
 * Returns the raw token to construct the invitation link.
 */
export async function createCandidateInvitation({
  candidateId,
  offerId = null,
  applicationId = null,
  email,
  scope = 'all',
  expiresInDays = 7,
}) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  // Invalidate any prior active tokens for this candidate & offer
  await pool.query(
    `UPDATE candidate_portal_tokens
     SET revoked_at = NOW()
     WHERE candidate_id = ? AND (offer_id = ? OR offer_id IS NULL) AND revoked_at IS NULL`,
    [candidateId, offerId]
  );

  await pool.query(
    `INSERT INTO candidate_portal_tokens
      (candidate_id, offer_id, application_id, token_hash, email, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [candidateId, offerId, applicationId, tokenHash, email, scope, expiresAt]
  );

  return {
    rawToken,
    expiresAt,
  };
}

/**
 * Authenticates a raw candidate invitation token.
 * Validates expiration and revocation.
 */
export async function verifyCandidateToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ApiError(401, 'Invitation token is missing or invalid.');
  }

  const tokenHash = hashToken(rawToken);

  const [rows] = await pool.query(
    `SELECT t.*, c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone
     FROM candidate_portal_tokens t
     JOIN recruitment_candidates c ON c.id = t.candidate_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL`,
    [tokenHash]
  );

  if (!rows.length) {
    throw new ApiError(401, 'Invitation link is invalid or has been revoked.');
  }

  const record = rows[0];
  if (new Date(record.expires_at) < new Date()) {
    throw new ApiError(401, 'This invitation link has expired. Please contact HR for a new invitation.');
  }

  return record;
}

/**
 * Sends candidate portal invitation email.
 */
export async function sendCandidateInvitationEmail({
  candidateName,
  candidateEmail,
  jobTitle,
  rawToken,
  type = 'offer', // 'offer' or 'onboarding'
  baseUrl = process.env.APP_URL || 'http://localhost:5173',
}) {
  const portalLink = `${baseUrl}/portal/candidate?token=${rawToken}`;

  const subject =
    type === 'offer'
      ? `Action Required: Your Employment Offer & Portal Access - Aurora Labs`
      : `Welcome to Aurora Labs: Complete Your Employee Onboarding`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: auto;">
      <h2 style="color: #0f172a;">Hello, ${candidateName}!</h2>
      <p>
        ${
          type === 'offer'
            ? `Your official offer letter for <strong>${jobTitle}</strong> at Aurora Labs is ready for your review and response.`
            : `We are thrilled to welcome you to the Aurora Labs team! Please access your onboarding portal to submit your details and documents.`
        }
      </p>
      <div style="margin: 25px 0; text-align: center;">
        <a href="${portalLink}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">
          ${type === 'offer' ? 'Review & Respond to Offer' : 'Start Onboarding Portal'}
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b;">
        This secure link is uniquely tied to your profile and will expire in 7 days. Do not share this email.
      </p>
      <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">
        Direct link: <a href="${portalLink}" style="color: #6366f1;">${portalLink}</a>
      </p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b;">Aurora Labs People Operations Team</p>
    </div>
  `;

  return sendEmail({
    to: candidateEmail,
    subject,
    html,
  });
}

