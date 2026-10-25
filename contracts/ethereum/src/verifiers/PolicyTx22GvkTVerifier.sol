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

contract PolicyTx22GvkTVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 8039210909784414160652663914596632711166776808789410003630095875374554267614;
    uint256 constant alphay  = 20674950813690507181162499742584247867478077511430956325432857270643713694465;
    uint256 constant betax1  = 14586199655575465856555932209937860867249834409052148217389805867971560574560;
    uint256 constant betax2  = 20890757644740652623295929394119175427791762892870637527139872645803123312502;
    uint256 constant betay1  = 414555749445439755147501498097754559110228228193419990189664188304157853850;
    uint256 constant betay2  = 9599709758017414514993493517973212007305711582788669693648825897409858196856;
    uint256 constant gammax1 = 2191941498551349450789180818146472170954261817828497110929666926341718301740;
    uint256 constant gammax2 = 9870274354384301094659423108272675509341522176709112584265989710891953514130;
    uint256 constant gammay1 = 5894965221653869046556493611918031770357381743650602911262042768769666034148;
    uint256 constant gammay2 = 9238924171814497651213879404043018188587169577119877738269914665615986015625;
    uint256 constant deltax1 = 7133788664937482720694996664258075790703350257855419913528641363316946633335;
    uint256 constant deltax2 = 15482360972493905985570858939266953507757857715362173424028146822792145248557;
    uint256 constant deltay1 = 16545149006640797211259136810977898451048960014479040828563684255003538106673;
    uint256 constant deltay2 = 2938965399889871157214554074179311316560169969972533982951100462745379552529;

    
    uint256 constant IC0x = 9487015338497082694655006975633667010056231600796722274170885260348218335254;
    uint256 constant IC0y = 3618203244178748071188853695145682394530784646031751809137395319770346269025;
    
    uint256 constant IC1x = 21705278133166753033201923448253801708966294868382864588500525664445053874800;
    uint256 constant IC1y = 21277050758008969604771492385891648358137616094287674623668311203565005968171;
    
    uint256 constant IC2x = 14181238229460625635698028424076997864750746084127964126232806741858214620920;
    uint256 constant IC2y = 19474978493445670714423797284593037050812229244517765551611590195481487117983;
    
    uint256 constant IC3x = 11606215030000694861286914928222827670472343268497490641097097778332023977654;
    uint256 constant IC3y = 4335046178834678520141978220458434277824678363048095100846251511063452119455;
    
    uint256 constant IC4x = 9381823478627493872768829261839372320629204125363273731163828493568781774646;
    uint256 constant IC4y = 5000465459366104655571643395166369685361139047422156697102913444118617031336;
    
    uint256 constant IC5x = 8480325259429872464001561744214733582349518996718993826222065499208304946923;
    uint256 constant IC5y = 11704030461849671396529226679394365153241712720117930080911736899364155352338;
    
    uint256 constant IC6x = 4484690920820547511806207278672450765478678005733984803604002358489422175156;
    uint256 constant IC6y = 20402485709376999169722200704934187792873992117389970144498107271821068965146;
    
    uint256 constant IC7x = 8968877834676432142312738320838977418396362189956367465283961843886440842734;
    uint256 constant IC7y = 9950506796169369298236726664451423502312651064011403625728329575833098003569;
    
    uint256 constant IC8x = 12152648950727644300634320803276186324585540380969178564797764088146442463699;
    uint256 constant IC8y = 7128409198605378620207028686115869415396266341480392599570419387310698878572;
    
    uint256 constant IC9x = 15363996958416007796685091017528900205059260438091845890011103923125108607206;
    uint256 constant IC9y = 10582440857345886719971055972140236098217550645494448932560123208069925964109;
    
    uint256 constant IC10x = 6933398673809343057726324652507905732726807965372206252233505620084139058378;
    uint256 constant IC10y = 688267469583784036605335880266868545304643421568080498847151836812204161697;
    
    uint256 constant IC11x = 6566208416170195156045744927962120549217292275292409451247753462444123569696;
    uint256 constant IC11y = 4018061796182145986127453008683288908217934339325922744840467055660770708483;
    
    uint256 constant IC12x = 2644153505983645841517244655979077410497292982702934831982627470205774049507;
    uint256 constant IC12y = 17214562977939729291738489729426795339824903534630553760132240473583630289170;
    
    uint256 constant IC13x = 20537584830606048834326489996863613107303196386311460775093852322478238795383;
    uint256 constant IC13y = 14878336944508990030926813283639503928288991588622785585954547642358316460959;
    
    uint256 constant IC14x = 18524372681249918124281835696428939995145410444384844641850010493660619707375;
    uint256 constant IC14y = 2457458883568493727575001453122750952287634421995387872783456304594061407110;
    
    uint256 constant IC15x = 14203567368439314257379033769380899398082674599100018736518106329547015113676;
    uint256 constant IC15y = 5989094615366965435312425023261548849984732959227384056827655047683967633393;
    
    uint256 constant IC16x = 11616890919808546040496650288547281693951680732660823441115730113762818740898;
    uint256 constant IC16y = 13673490148319673145020468722767934181008881436376111063519412665875122134950;
    
    uint256 constant IC17x = 21299304512446079192265268293330678285550906374659646264829571955603167066310;
    uint256 constant IC17y = 9988167064304921656546434973978638377213109245166557505914116720296405317972;
    
    uint256 constant IC18x = 2183591244509367615895500890502985052694547375472275356585844496687555854009;
    uint256 constant IC18y = 890497012461104502388819375249183823987836198015361757586758902385707893075;
    
    uint256 constant IC19x = 16909589629359786164069873331859957410596346089861744941430800951802064831794;
    uint256 constant IC19y = 21496511069884770005697072014936309970980007252585186522409208986088048374244;
    
    uint256 constant IC20x = 193482538310561568318008666873122475405669710850862036141328522750527479113;
    uint256 constant IC20y = 21482892001992642371303575086174008172514121306864980549688002340349623108444;
    
    uint256 constant IC21x = 13321419259830869039316515496224938801546606537257918621184676248304500875292;
    uint256 constant IC21y = 13426926214331913608612329474898894040291422642099831511160816384490267785584;
    
    uint256 constant IC22x = 19719700451440610210751659175989716298012961766498477283199013033649218626989;
    uint256 constant IC22y = 5211916505109447049928627047441216124295752945943455127422659966089348271598;
    
    uint256 constant IC23x = 21381470817180015911563702681867258255830515440840173803777806186486403312789;
    uint256 constant IC23y = 3335028852365886650646644342936783617210408012448703928325523560653096942322;
    
    uint256 constant IC24x = 17983590461568524774728959889082320976084568314263624194882285175056917121112;
    uint256 constant IC24y = 2922719235555562018715216641643449306263374794727552904613193113174169147430;
    
    uint256 constant IC25x = 701343974274058327045260619754672088620802298402002881344095812359111940400;
    uint256 constant IC25y = 18998314609967769597637415785843898870052472310655581888913847321134418420006;
    
    uint256 constant IC26x = 9674980358457126021877714958404965420553933036579723543170714120703416158745;
    uint256 constant IC26y = 64284096525657731906992723152203705292947102306683276535101668826467872683;
    
    uint256 constant IC27x = 358675407588775253956125154732254347866118835643151003583859731597434076310;
    uint256 constant IC27y = 17692691128721291508407009461590581847783090130316694130705520356121121368918;
    
    uint256 constant IC28x = 890837751295040372014215983730924680133245964764089307041439522598834930809;
    uint256 constant IC28y = 16345836220126942090561591858944172870178525456983266644812430562478537681010;
    
    uint256 constant IC29x = 1737755262772213746615889264300021052582719615034997334043487968458308594565;
    uint256 constant IC29y = 5105340560684230894331811173229499999538578816014139984333192998255901666875;
    
    uint256 constant IC30x = 5345657786096895842290603846289773717617595856598142518119246120417333241491;
    uint256 constant IC30y = 12326487196241249661169246232985768305768925441288823272352154964544095380259;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[30] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                
                g1_mulAccC(_pVk, IC30x, IC30y, calldataload(add(pubSignals, 928)))
                

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
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            
            checkField(calldataload(add(_pubSignals, 928)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
