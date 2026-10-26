use super::*;
use soroban_sdk::{contract,contractimpl,Bytes,Executable,testutils::{Address as _,MockAuth,MockAuthInvoke}};
#[contract] struct MockPool;
#[contractimpl] impl MockPool {
 pub fn __constructor(env:Env,token:Address){env.storage().instance().set(&0u32,&token);}
 pub fn get_token(env:Env)->Address{env.storage().instance().get(&0u32).unwrap()}
 pub fn get_policy_flags()->u32{0}
 pub fn transact(env:Env,_proof:PoolProof,ext_data:ExtData,sender:Address){sender.require_auth();let token:Address=env.storage().instance().get(&0u32).unwrap();TokenClient::new(&env,&token).transfer(&sender,&env.current_contract_address(),&ext_data.ext_amount.to_i128().unwrap());}
}
fn fixture()->(Env,Address,Address,Address,Config){
 let env=Env::default();let admin=Address::generate(&env);let token=env.register_stellar_asset_contract_v2(admin.clone()).address();let pool=env.register(MockPool,(token.clone(),));
 let hash=match pool.executable().unwrap(){Executable::Wasm(h)=>h,_=>panic!("expected wasm")};
 let config=Config{token:token.clone(),pool:pool.clone(),pool_hash:hash,manifest:BytesN::from_array(&env,&[1;32]),entries:vec![&env,Allocation{amount:10,commitment0:U256::from_u32(&env,11),commitment1:U256::from_u32(&env,12)}]};
 let inbox=env.register(BatchInbox,(config.clone(),));
 env.mock_auths(&[MockAuth{address:&admin,invoke:&MockAuthInvoke{contract:&token,fn_name:"mint",args:(inbox.clone(),100i128).into_val(&env),sub_invokes:&[]}}]);
 soroban_sdk::token::StellarAssetClient::new(&env,&token).mint(&inbox,&100);env.mock_auths(&[]);
 (env,token,pool,inbox,config)
}
fn proof(env:&Env)->PoolProof{PoolProof{proof:Groth16Proof{a:soroban_sdk::crypto::bn254::Bn254G1Affine::from_bytes(BytesN::from_array(env,&[0;64])),b:soroban_sdk::crypto::bn254::Bn254G2Affine::from_bytes(BytesN::from_array(env,&[0;128])),c:soroban_sdk::crypto::bn254::Bn254G1Affine::from_bytes(BytesN::from_array(env,&[0;64]))},root:U256::from_u32(env,1),input_nullifiers:vec![env,U256::from_u32(env,2),U256::from_u32(env,3)],output_commitment0:U256::from_u32(env,11),output_commitment1:U256::from_u32(env,12),public_amount:U256::from_u32(env,100),ext_data_hash:BytesN::from_array(env,&[0;32]),asp_membership_root:U256::from_u32(env,0),asp_non_membership_root:U256::from_u32(env,0)}}
fn ext(env:&Env,inbox:&Address)->ExtData{ExtData{recipient:inbox.clone(),ext_amount:I256::from_i128(env,100),encrypted_output0:Bytes::new(env),encrypted_output1:Bytes::new(env)}}
#[test]fn pays_only_fixed_private_allocation_without_mocked_subcall_auth(){let(env,token,pool,inbox,_)=fixture();let client=BatchInboxClient::new(&env,&inbox);client.deposit(&0,&proof(&env),&ext(&env,&inbox));assert!(client.is_claimed(&0));assert_eq!(TokenClient::new(&env,&token).balance(&pool),100);assert_eq!(TokenClient::new(&env,&token).balance(&inbox),0);assert!(client.try_deposit(&0,&proof(&env),&ext(&env,&inbox)).is_err());}
#[test]fn cannot_change_private_recipient_commitment(){let(env,_,_,inbox,_)=fixture();let mut p=proof(&env);p.output_commitment0=U256::from_u32(&env,999);assert!(BatchInboxClient::new(&env,&inbox).try_deposit(&0,&p,&ext(&env,&inbox)).is_err());}
