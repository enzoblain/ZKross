// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract BridgeInVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 16015220254461085528704399845050929846509534456284493616133642641600826091383;
    uint256 constant alphay  = 8137791865131265018005973289415537862595096262169247672886094564762078422375;
    uint256 constant betax1  = 14043465167446926351188501698380399790243877438920288866364348302966744498280;
    uint256 constant betax2  = 21402059741905170506229639733038491694986968685861830505550508138603096816018;
    uint256 constant betay1  = 9393983475942836528353279001067566996484529444198337060414699926711714568004;
    uint256 constant betay2  = 1689665597827957658033527100639913353553267902488244181856612230907499569705;
    uint256 constant gammax1 = 11368365058483935494440500622771502534594873834036388592443632421075783548016;
    uint256 constant gammax2 = 1469694873006697881612004200189084420042564170658355144515362088758493564024;
    uint256 constant gammay1 = 15255467211999562742339329445710882050605934885792065626064691632779800583604;
    uint256 constant gammay2 = 5926781881409401498301348268357837257804187801279417190266105329921316679648;
    uint256 constant deltax1 = 17855648505383325826078245975562259354791521556874183827010755297950092673277;
    uint256 constant deltax2 = 12441964821830220267065792161172448171876031801050908659427565196049879869786;
    uint256 constant deltay1 = 1387237173008662365970347825149698628393179783090964673944236784197820258854;
    uint256 constant deltay2 = 225051894921112044929472188418277784054669510999322883040778955502955362085;

    
    uint256 constant IC0x = 16828178920878246656301670678773462779089215941084938717266814611488195103630;
    uint256 constant IC0y = 4073422016391457033118147688657062975615917607981168613891273045577780416252;
    
    uint256 constant IC1x = 21607118128332794706665069827659080772007541199668821655427972879619209301538;
    uint256 constant IC1y = 5589788463009066935437259467004128379422326971874038693221959899967062086134;
    
    uint256 constant IC2x = 17019025537217229793092733628344261970766414222603653573102123265953377716465;
    uint256 constant IC2y = 9134652193377410023701767523726351765710198060313774522811151434045339943190;
    
    uint256 constant IC3x = 20153122678492358288870452782431823939733708351362967429237813191060678374462;
    uint256 constant IC3y = 10637995550167903135256020333856242449331258926842284534743195274121731894330;
    
    uint256 constant IC4x = 20903222779068206115798510511253268512123092304471879166315075794694608319314;
    uint256 constant IC4y = 762456637255019256856255231123429817143051758836734148253770327491846861230;
    
    uint256 constant IC5x = 20478150527633800692240158022512184609219413552931632682319315596927489218260;
    uint256 constant IC5y = 14205225031816647244223616351310777651901842356516141568660339162244550289686;
    
    uint256 constant IC6x = 12484426491845583601651230355779406644830797491242653242603949711976488463093;
    uint256 constant IC6y = 2461060704482719776378248001086229941193372807929084749982182512823689169057;
    
    uint256 constant IC7x = 10339055524742301101217437260541843788396350363379008311019897485746498998617;
    uint256 constant IC7y = 3501564151219550701889620034081851431316491930757724933707342175210498633636;
    
    uint256 constant IC8x = 16174822821378690411031148957572025019350842953510701691685021229710488394577;
    uint256 constant IC8y = 7991041498276669946089732714787069856504152190261674585247638589512539247829;
    
    uint256 constant IC9x = 11910059570257330579526015840515951908309068317438921339836268898677217043241;
    uint256 constant IC9y = 18671400385619518851598716656923686354513751542584452221562255674516628909495;
    
    uint256 constant IC10x = 11824645068247103547653564935832846126075197268033211935083233493022163550391;
    uint256 constant IC10y = 17238780189578992262565514002832467855789168204582245935122813320330326532656;
    
    uint256 constant IC11x = 6176654454072779902641964648851726146372684152093848025404843175521094571711;
    uint256 constant IC11y = 3408428292203658125234682886692881781000925255365960692130901008781392791903;
    
    uint256 constant IC12x = 17119698060372058755207328965729237244592557101156017039805186891008033702663;
    uint256 constant IC12y = 14595579630211653845141770282241149510490559329195442258956890050511437794090;
    
    uint256 constant IC13x = 1908333558331675931422908798400843224934659172457431311285667989730226668212;
    uint256 constant IC13y = 2077095714270657104657977456418039492441168057530411654495362627737532871894;
    
    uint256 constant IC14x = 11030080673298394962970086600105872864865090102755587513446831521133406239551;
    uint256 constant IC14y = 18713081630065993616325248122173017909722195269574919374044522653930492461789;
    
    uint256 constant IC15x = 21273629665288681379653944850735407728255828730417368152437702515078428748392;
    uint256 constant IC15y = 3318035360595690412583097306572209893112697273952431442339841524261939900599;
    
    uint256 constant IC16x = 1475495533040969850207600603813139659784383594694000614188741328265060228962;
    uint256 constant IC16y = 5408583981544316075584552249053956231845534947273774887735988819834270241389;
    
    uint256 constant IC17x = 4368734618763010803485572554214709071139025783894483014399949745559639567524;
    uint256 constant IC17y = 18324944003109083663423174407985177529067360145760412108832830955034132299511;
    
    uint256 constant IC18x = 14148234665959190701740652169263805530957429756250037166209512160504151814829;
    uint256 constant IC18y = 16556805260825820555519651587355612850319108080059469615322630743251538962038;
    
    uint256 constant IC19x = 4781465910550512437160335698716492733693466951643766017510684397847556255308;
    uint256 constant IC19y = 7451913619550225771578046870005565893040447670672301442170949727111129968539;
    
    uint256 constant IC20x = 5011678676056432997829206027207864707182491601976490304855441194904205688284;
    uint256 constant IC20y = 1001970390226186190084764942808344523978436203777625667512149810449977427428;
    
    uint256 constant IC21x = 12046028414031499484408333079367275018853646570171626737679584210598765556584;
    uint256 constant IC21y = 1889350474773128494384352229009356929116955828005272723287761793600877216186;
    
    uint256 constant IC22x = 2214514467815994775310353434404156826737350503704798018014556181089838682557;
    uint256 constant IC22y = 19623270887707800069297957682074544831174917582484243593407945775069330818271;
    
    uint256 constant IC23x = 14160907499780065623275766046711153638002129032505733211631701722898545033852;
    uint256 constant IC23y = 18152608449168887808257273050916963928798137021937416187752097966776282696276;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[23] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
