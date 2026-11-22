# motoPack customer sign-in

Create a customer Cloudflare Access self-hosted application covering electricmotogarage.com/MotoPack/account/*, including the sign-in start route. Keep the landing page public. Enable One-time PIN and the customer identity provider that offers registration and MFA. Allow verified customer identities under the customer application policy. Use a separate audience from the EMG admin application.

Set the Worker variables ACCESS_TEAM_DOMAIN (the team hostname) and MOTOPACK_ACCESS_AUD (the customer application audience). The Worker verifies the signed Access assertion before reading or writing account data. The local loopback preview uses browser storage. Test email delivery, provider registration, access expiry and retrieval with two separate inboxes before publishing.

Save to account stores the current project in private KV by verified identity. Community frames are separate copies submitted with an explicit checkbox and public name. Shared uploads include the calibrated reference image and, for a CAD frame, the mesh. The original image can contain identifying details. Review it before sharing.
