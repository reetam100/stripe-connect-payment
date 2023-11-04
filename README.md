### This is the repository for stripe connect payment.
## Services:
- customers can add multiple cards to their payment source.
- sellers can onboard themselves on stripe connect.
- sellers can get the list of all the payments made to them.
- sellers retrieve their account balance and payout.

### Conclusion: 
- Sellers can schedule their payout through the dashboard (instant payouts won't work for standard account).
- [Documentation](https://stripe.com/docs/api/): 
- To use the core APIs for connect account you need to add an object with the key "stripeAccount" as the second parameter and pass in the connect account ID in that, which is like "acct_1O7x9m....."