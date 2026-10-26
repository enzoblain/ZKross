#![no_std]
//! Experimental per-batch inbox. There is no administrator or withdrawal method.
//! It distributes actual received USDC only to immutable private commitments.
//! Minting through Circle's forwarder can happen before or after deployment calls;
//! front-running that public mint cannot change allocations or steal note ownership.
use soroban_sdk::{contract,contractimpl,contracttype,contracterror,contractclient,Address,BytesN,Env,U256,Vec,I256,IntoVal,Symbol,vec,token::TokenClient,auth::{ContractContext,InvokerContractAuthEntry,SubContractInvocation}};
use pool_core::{ExtData,clients::runs_wasm};
use contract_types::Groth16Proof;
#[derive(Clone)]
#[contracttype]
pub struct Allocation {pub amount:u64,pub commitment0:U256,pub commitment1:U256}
#[derive(Clone)]
#[contracttype]
pub struct Config {pub token:Address,pub pool:Address,pub pool_hash:BytesN<32>,pub manifest:BytesN<32>,pub entries:Vec<Allocation>}
#[contracttype]
pub struct PoolProof {pub proof:Groth16Proof,pub root:U256,pub input_nullifiers:Vec<U256>,pub output_commitment0:U256,pub output_commitment1:U256,pub public_amount:U256,pub ext_data_hash:BytesN<32>,pub asp_membership_root:U256,pub asp_non_membership_root:U256}
#[contractclient(name="PrivatePoolClient")]
pub trait PrivatePool {fn transact(env:Env,proof:PoolProof,ext_data:ExtData,sender:Address);fn get_token(env:Env)->Address;fn get_policy_flags(env:Env)->u32;}
#[contracterror]
#[derive(Copy,Clone,Debug,Eq,PartialEq)]
#[repr(u32)]
pub enum Error {InvalidConfig=1,AlreadyClaimed=2,WrongAllocation=3,InsufficientFunds=4,WrongCode=5}
#[derive(Clone)]
#[contracttype]
enum Key {Config,Claimed(u32),Entered}
#[contract]
pub struct BatchInbox;
#[contractimpl]
impl BatchInbox {
 pub fn __constructor(env:Env,config:Config)->Result<(),Error>{
  if config.entries.is_empty()||config.entries.len()>8||!runs_wasm(&config.pool,&config.pool_hash){return Err(Error::InvalidConfig);}
  let pool=PrivatePoolClient::new(&env,&config.pool);
  if pool.get_token()!=config.token||pool.get_policy_flags()!=0{return Err(Error::InvalidConfig);}
  for e in config.entries.iter(){if e.amount==0||e.amount>100000000000||e.commitment0==U256::from_u32(&env,0){return Err(Error::InvalidConfig);}}
  env.storage().instance().set(&Key::Config,&config);Ok(())
 }
 pub fn get_config(env:Env)->Config {env.storage().instance().get(&Key::Config).unwrap()}
 pub fn is_claimed(env:Env,index:u32)->bool {env.storage().persistent().has(&Key::Claimed(index))}
 pub fn deposit(env:Env,index:u32,proof:PoolProof,ext:ExtData)->Result<(),Error>{
  if env.storage().instance().get(&Key::Entered).unwrap_or(false)||Self::is_claimed(env.clone(),index){return Err(Error::AlreadyClaimed);}
  let config=Self::get_config(env.clone());if !runs_wasm(&config.pool,&config.pool_hash){return Err(Error::WrongCode);}
  let entry=config.entries.get(index).ok_or(Error::WrongAllocation)?;let amount=i128::from(entry.amount)*10;let own=env.current_contract_address();
  if proof.output_commitment0!=entry.commitment0||proof.output_commitment1!=entry.commitment1||proof.public_amount!=U256::from_u128(&env,amount as u128)||ext.ext_amount!=I256::from_i128(&env,amount)||ext.recipient!=own{return Err(Error::WrongAllocation);}
  let token=TokenClient::new(&env,&config.token);let before_=token.balance(&own);if before_<amount{return Err(Error::InsufficientFunds);}
  env.storage().instance().set(&Key::Entered,&true);env.storage().persistent().set(&Key::Claimed(index),&true);
  env.authorize_as_current_contract(vec![&env,InvokerContractAuthEntry::Contract(SubContractInvocation{context:ContractContext{contract:config.token.clone(),fn_name:Symbol::new(&env,"transfer"),args:(own.clone(),config.pool.clone(),amount).into_val(&env)},sub_invocations:vec![&env]})]);
  PrivatePoolClient::new(&env,&config.pool).transact(&proof,&ext,&own);
  if token.balance(&own)!=before_-amount{return Err(Error::WrongAllocation);}
  env.storage().persistent().extend_ttl(&Key::Claimed(index),100000,500000);env.storage().instance().remove(&Key::Entered);Ok(())
 }
}
#[cfg(test)] mod test;
