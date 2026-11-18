"""Domain-specific benign training queries for the DistilBERT classifier."""

_ACTIONS = [
    ("reset password", [
        "How do I reset my account password?",
        "I forgot my password, can you help me reset it?",
        "Steps to change my login password",
        "Where is the password reset link located?",
        "Can you send a password reset email to my address?",
    ]),
    ("update payment", [
        "How can I update my credit card on file?",
        "Where do I enter a new payment method?",
        "Can I change the card used for my recurring subscription?",
        "Updating expired debit card details",
        "How do I remove an old payment card from my profile?",
    ]),
    ("cancel order", [
        "I need to cancel the order I placed an hour ago",
        "How can I request cancellation for a pending order?",
        "Is it possible to cancel an order before it ships?",
        "Can customer support cancel order #48291 for me?",
        "What is the deadline for cancelling an order?",
    ]),
    ("track package", [
        "Where can I find the tracking number for my shipment?",
        "How do I check the delivery status of my package?",
        "Can you track my parcel with courier tracking ID?",
        "The tracking link isn't updating, what should I do?",
        "How do I know when my order is out for delivery?",
    ]),
    ("request refund", [
        "What is the step-by-step process to request a refund?",
        "How do I apply for a refund for a damaged product?",
        "Who should I contact to get my money back for a return?",
        "Can I get a refund credited to my original payment method?",
        "I was charged twice, how do I get a refund for the duplicate charge?",
    ]),
    ("return item", [
        "What are the requirements for returning an opened item?",
        "Do I need the original packaging to initiate a return?",
        "How do I print a pre-paid return shipping label?",
        "Can I drop off my return at a local partner store?",
        "How many days do I have to send an item back?",
    ]),
    ("exchange product", [
        "Can I exchange my shirt for a larger size?",
        "How does an exchange work if the new item is cheaper?",
        "Is there an extra shipping fee for exchanging an item?",
        "How long do replacement items take to arrive after an exchange?",
        "Can I exchange a defective unit for a new one?",
    ]),
    ("change shipping address", [
        "Can I update the delivery address for an order currently in transit?",
        "How do I change my default shipping address in account settings?",
        "I entered the wrong apartment number, can you fix it?",
        "Updating the destination address on my pending shipment",
        "Does changing my billing address also change my delivery address?",
    ]),
    ("delete account", [
        "How do I permanently delete my user account and personal data?",
        "What happens to my order history if I close my account?",
        "Can I request complete deletion of my stored payment details?",
        "Steps to close an inactive customer profile",
        "Is account deletion reversible within 30 days?",
    ]),
    ("apply promo code", [
        "Where do I enter my promotional discount code during checkout?",
        "Why is my coupon code showing as invalid or expired?",
        "Can I combine a gift voucher with a promotional code?",
        "How do I apply a military discount to my cart?",
        "Does the welcome discount apply to sale items?",
    ]),
    ("download invoice", [
        "Where can I download a PDF copy of my latest invoice?",
        "How do I get a receipt for expense reimbursement?",
        "Can you email me tax invoices for my purchases last quarter?",
        "Where do I find official VAT receipts in my account dashboard?",
        "How do I view invoice details for order #91028?",
    ]),
    ("two factor authentication", [
        "How do I enable two-factor authentication (2FA) on my account?",
        "Can I use an authenticator app instead of SMS for security?",
        "What should I do if I lost access to my 2FA verification device?",
        "Setting up backup security codes for two-step login",
        "How do I disable 2FA temporarily while travelling?",
    ]),
    ("change email address", [
        "How can I change the primary email associated with my profile?",
        "I lost access to my registered email, how can I recover my account?",
        "Can I merge two accounts registered under different emails?",
        "Steps to verify a newly added email address",
        "Why haven't I received the email verification link yet?",
    ]),
    ("subscription billing", [
        "When does my monthly subscription renew and charge my card?",
        "How do I switch from a monthly billing plan to an annual plan?",
        "Can I pause my active subscription for two months?",
        "What happens to my service access if a recurring renewal payment fails?",
        "How do I turn off automatic renewal for my membership?",
    ]),
    ("warranty claim", [
        "How do I file a warranty claim for a malfunctioning product?",
        "What documents or proof of purchase do I need for warranty service?",
        "Does the standard manufacturer warranty cover accidental water damage?",
        "How long does a warranty repair or replacement inspection take?",
        "Where do I send an item covered under extended warranty?",
    ]),
    ("shipping international", [
        "What countries do you currently offer international shipping to?",
        "Are customs duties and import taxes included in the shipping fee?",
        "How long does overseas standard delivery usually take to arrive?",
        "Which courier partners handle international deliveries?",
        "Why is international shipping restricted for certain products?",
    ]),
    ("loyalty rewards", [
        "How do I check my accumulated loyalty points balance?",
        "What is the conversion rate of reward points to store credit?",
        "Do promotional reward points expire if not redeemed within a year?",
        "How do I redeem my loyalty discount at checkout?",
        "What perks are included in the VIP customer tier?",
    ]),
    ("gift cards", [
        "How do I redeem a digital gift card on my purchase?",
        "Can I check the remaining balance on my gift voucher online?",
        "Do electronic gift certificates have an expiration date?",
        "Can I buy a physical gift card and have it mailed to a friend?",
        "What happens if my order total exceeds my gift card balance?",
    ]),
    ("security privacy", [
        "How is my personal financial information protected on your site?",
        "What data encryption standards do you use for customer transactions?",
        "Can I request a copy of all personal information you hold on me?",
        "How do I opt out of third-party marketing communications?",
        "Where can I read your official data privacy and GDPR compliance policy?",
    ]),
    ("bulk wholesale", [
        "Do you offer volume discounts for bulk corporate purchases?",
        "How can I request a customized price quote for an order of 50+ units?",
        "What are the delivery terms and lead times for wholesale freight orders?",
        "Can businesses pay via purchase order (PO) or net-30 invoicing?",
        "Who is the account manager for corporate procurement enquiries?",
    ]),
    ("damaged item", [
        "My order arrived with damaged packaging and broken contents, what now?",
        "What photos are required when reporting goods damaged in transit?",
        "How quickly can a replacement be dispatched for a broken item?",
        "Should I refuse delivery if the outer carton is clearly crushed?",
        "Who covers return shipping fees for items that arrived defective?",
    ]),
    ("shipping speed", [
        "What is the delivery time difference between standard and express shipping?",
        "Do you provide guaranteed next-day delivery for urgent orders?",
        "What is the daily cutoff time for same-day dispatch?",
        "Is weekend delivery available in metropolitan postal codes?",
        "How much does overnight priority shipping cost?",
    ]),
    ("eco packaging", [
        "Are your shipping boxes made from recycled biodegradable materials?",
        "Can I opt for minimal plastic packaging during checkout?",
        "Do you have a take-back program for recycling old electronic accessories?",
        "What is your company's carbon-neutral delivery initiative?",
        "How should I properly dispose of or recycle the packing peanuts?",
    ]),
    ("contact support", [
        "What are the operating hours for live chat and phone customer support?",
        "Is phone support available on national holidays and weekends?",
        "What is the average response time for support tickets submitted via email?",
        "How can I escalate an unresolved issue to a senior supervisor?",
        "Can I schedule a callback from a customer service representative?",
    ]),
    ("store credit", [
        "How do I view my available store credit balance?",
        "Can store credit be applied automatically to my next purchase?",
        "Does store credit carry an expiration date or maintenance fee?",
        "Can I transfer my store credit to a different user account?",
        "Can store credit be refunded back as cash or card balance?",
    ]),
    ("product availability", [
        "When is the out-of-stock color variant expected to be replenished?",
        "Can I sign up for an email alert when an item is back in stock?",
        "Is this product available for immediate pickup in local retail stores?",
        "Can I pre-order an upcoming model before the official release date?",
        "Why is a certain size variant marked as discontinued?",
    ]),
    ("price match", [
        "Do you offer price matching against major authorized retail competitors?",
        "What criteria must be met for a competitor price match request?",
        "Can I get a retroactive price adjustment if an item goes on sale next week?",
        "Does price matching apply during Black Friday or seasonal clearance sales?",
        "How do I submit proof of a lower competitor price for approval?",
    ]),
    ("user reviews", [
        "How can I submit a verified buyer review and rating for my purchase?",
        "Can I edit or update a product review I submitted previously?",
        "Why was my customer review flagged or pending moderation?",
        "Can I upload customer photos and videos alongside my feedback?",
        "How do I report a misleading or fraudulent product review?",
    ]),
    ("service terms", [
        "Where can I review the complete terms and conditions of service?",
        "What are the buyer protection terms for transactions on your platform?",
        "How are intellectual property and copyright disputes handled?",
        "Where are your corporate headquarters and legal registration details?",
        "What governing law applies to consumer contracts on this site?",
    ]),
    ("holiday schedule", [
        "Are delivery dates adjusted during peak holiday and Christmas seasons?",
        "What is the guaranteed order cutoff date for delivery before Christmas?",
        "Does customer support operate on reduced hours during New Year's Day?",
        "Are warehouse fulfillment facilities open on federal public holidays?",
        "Will weather-related winter delays affect estimated shipping times?",
    ]),
]

_SUMMARIZE_QUERIES = [
    "Can you summarize the latest account security bulletin?",
    "Can you summarize the latest support ticket resolution notes?",
    "Can you summarize the latest company policy update?",
    "Can you summarize the latest product FAQ update?",
    "Can you summarize the latest quarterly report summary?",
    "Can you summarize the latest onboarding guide update?",
    "Can you summarize the latest warranty terms document?",
    "Can you summarize the latest refund policy changes?",
    "Can you summarize the latest shipping guidelines?",
    "Can you summarize the latest holiday opening hours notice?",
    "Can you summarize the latest mobile app release notes?",
    "Can you summarize the latest gift wrapping service terms?",
    "Can you summarize the latest store credit rules update?",
    "Can you summarize the latest privacy policy modifications?",
    "Can you summarize the latest security practices overview?",
    "Can you summarize the latest pricing plans comparison?",
    "Could you provide a quick summary of the return and exchange policy?",
    "Please summarize the main points of our warranty coverage document.",
    "Can you give me a brief overview of the latest international shipping terms?",
    "Summary of the latest customer satisfaction survey results please.",
    "Can you summarize our company's eco-friendly packaging commitment?",
    "Please summarize the steps required to file an insurance claim for lost cargo.",
    "Could you summarize the key changes in the updated terms of service?",
    "Can you summarize the FAQ section regarding subscription pauses and cancellations?",
    "Please give me a concise summary of the payment gateway security standards.",
    "Can you summarize the accessibility accommodations described in the statement?",
    "Could you summarize the referral reward program tier thresholds?",
    "Please summarize the bulk order pricing discounts and freight terms.",
    "Can you summarize the warehouse relocation schedule and blackout dates?",
    "Summary of the seasonal sale return exceptions please.",
]

_LONG_MESSAGES = [
    "Hello support team, I ordered two jackets on Monday using express shipping, but the tracking number says "
    "it has not been scanned at the distribution center yet. I am traveling abroad on Thursday evening and "
    "really need these items before departure. Could you check if the warehouse has dispatched them, and if not, "
    "can we upgrade the carrier service or arrange an urgent pickup?",

    "Hi there, I recently noticed an unexpected recurring charge of $29.99 on my credit card statement from your "
    "service. I believed I had canceled my monthly membership at the end of last month after my free trial expired. "
    "Could you please inspect my account transaction history, confirm the cancellation status, and process a "
    "refund for this latest billing cycle?",

    "Good morning. Our organization is interested in purchasing approximately 75 units of your commercial hardware "
    "for an upcoming office expansion. We would like to inquire about volume discount pricing, payment terms under "
    "a corporate purchase order, and whether dedicated technical support onboarding is included with bulk accounts.",

    "I received my delivery yesterday afternoon, but unfortunately one of the glass ceramic items inside was completely "
    "shattered during transit. The outer cardboard box also had visible crush marks on one corner. I have taken clear "
    "photographs of the damaged item and packing slip. What is the fastest way to get a replacement unit sent out?",

    "I am trying to log into my account from a new laptop, but the SMS verification code is being sent to my old phone "
    "number which was disconnected last week. I still know my email and master password, and I have my order confirmation "
    "numbers from last month to verify identity. How can an administrator assist me in updating my two-step phone number?",

    "We are planning an annual inventory audit next month and need to reconcile all our vendor payments for fiscal year "
    "2026. Could you provide instructions on how to generate an itemized annual spending report and download batch PDF "
    "invoices for all transactions processed through our business account?",

    "I submitted a return request for two pairs of shoes three weeks ago and the courier tracking confirms the parcel "
    "was delivered to your returns warehouse on the 5th. However, my bank account does not show any pending credit or "
    "refund confirmation email. Could someone please check the inspection status of RMA return #7821?",

    "Could you explain the difference between the Basic, Professional, and Enterprise subscription tiers? We currently "
    "have 5 team members sharing a single account, and we want to understand if upgrading gives us individual employee "
    "logins, role-based access controls, and centralized billing under one company card.",
]


def _build_domain_list():
    queries = []
    for _, phrasings in _ACTIONS:
        for p in phrasings:
            queries.append(p.strip())
    for s in _SUMMARIZE_QUERIES:
        queries.append(s.strip())
    for m in _LONG_MESSAGES:
        queries.append(m.strip())
    return queries


TRAIN_DOMAIN_BENIGN = _build_domain_list()

if __name__ == "__main__":
    print(f"Generated {len(TRAIN_DOMAIN_BENIGN)} domain-specific benign queries.")
    print("Sample:", TRAIN_DOMAIN_BENIGN[:3])
